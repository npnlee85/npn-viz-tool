angular.module('npn-viz-tool.vis',[
    'npn-viz-tool.filter',
    'npn-viz-tool.filters',
    'npn-viz-tool.vis-scatter',
    'npn-viz-tool.vis-calendar',
    'npn-viz-tool.vis-wms',
    'ui.bootstrap'
])
.factory('ChartService',['$window','$http','$log','$modal','FilterService',
    function($window,$http,$log,$modal,FilterService){
    // some hard coded values that will be massaged into generated
    // values at runtime.
    var CHART_W = 930,
        CHART_H =500,
        MARGIN = {top: 20, right: 30, bottom: 60, left: 40},
        WIDTH = CHART_W - MARGIN.left - MARGIN.right,
        HEIGHT = CHART_H - MARGIN.top - MARGIN.bottom,
        SIZING = {
            margin: MARGIN,
            width: WIDTH,
            height: HEIGHT
        },
        VISUALIZATIONS = [{
            title: 'Scatter Plot',
            controller: 'ScatterVisCtrl',
            template: 'js/scatter/scatter.html',
            description: 'This visualization plots selected geographic or climactic variables against estimated onset dates for individuals for up to three species/phenophase pairs.'
        },{
            title: 'Calendar',
            controller: 'CalendarVisCtrl',
            template: 'js/calendar/calendar.html',
            description: 'This visualization illustrates annual timing of phenophase activity for selected species/phenophase pairs. Horizontal bars represent phenological activity at a site to regional level for up to two years.'
        },{
            title: 'Map',
            controller: 'WmsVisCtrl',
            template: 'js/wms/wms.html',
            description: 'Prelim research...  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec ac lectus nec augue cursus lacinia. Praesent sit amet eros nisi.'
        }],
        visualizeSingleStationId;
    function filterSuspectSummaryData (d){
        var bad = (d.latitude === 0.0 || d.longitude === 0.0 || d.elevation_in_meters < 0);
        if(bad) {
            $log.warn('suspect station data',d);
        }
        return !bad;
    }
    function addCommonParams(params) {
        if(visualizeSingleStationId) {
            params['station_id[0]'] = visualizeSingleStationId;
        } else {
            var filter = FilterService.getFilter();
            // if geo filtering add the explicit station_ids in question.
            if(filter.getGeographicArgs().length) {
                FilterService.getFilteredMarkers().forEach(function(marker,i){
                    params['station_id['+i+']'] = marker.station_id;
                });
            }
            // if network filtering in play add network_id/s
            filter.getNetworkArgs().forEach(function(n,i){
                params['network_id['+i+']'] = n.getId();
            });
        }
        return params;
    }
    function txformUrlEncoded(obj) {
        var encoded = [],key;
        for(key in obj) {
            encoded.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
        }
        return encoded.join('&');
    }
    function setVisualizeSingleStationId(id) {
        visualizeSingleStationId = id;
    }
    var service = {
        ONE_DAY_MILLIS: (24*60*60*1000),
        getSizeInfo: function(marginOverride){
            // make the chart 92% of the window width
            var margin = angular.extend({},MARGIN,marginOverride),
                cw = Math.round($window.innerWidth*0.90),
                ch = Math.round(cw*0.5376), // ratio based on initial w/h of 930/500
                w = cw  - margin.left - margin.right,
                h = ch  - margin.top - margin.bottom,
                sizing = {width: w, height : h, margin: margin};
            $log.debug('sizing',sizing);
            return sizing;
        },
        leastSquares: function(xSeries,ySeries) {
            if(xSeries.length === 0 || ySeries.length === 0) {
                return [Number.NaN,Number.NaN,Number.NaN];
            }
            var reduceSumFunc = function(prev, cur) { return prev + cur; };

            var xBar = xSeries.reduce(reduceSumFunc) * 1.0 / xSeries.length;
            var yBar = ySeries.reduce(reduceSumFunc) * 1.0 / ySeries.length;

            var ssXX = xSeries.map(function(d) { return Math.pow(d - xBar, 2); })
                .reduce(reduceSumFunc);

            var ssYY = ySeries.map(function(d) { return Math.pow(d - yBar, 2); })
                .reduce(reduceSumFunc);

            var ssXY = xSeries.map(function(d, i) { return (d - xBar) * (ySeries[i] - yBar); })
                .reduce(reduceSumFunc);

            var slope = ssXY / ssXX;
            var intercept = yBar - (xBar * slope);
            var rSquare = Math.pow(ssXY, 2) / (ssXX * ssYY);

            return [slope, intercept, rSquare];
        },
        approxY: function(leastSquaresCoeff,x) {
            // y = a + bx
            var a = leastSquaresCoeff[1],
                b = leastSquaresCoeff[0];
            return a + (b*x);
        },
        getSummarizedData: function(params,success) {
            $http({
                method: 'POST',
                url: '/npn_portal/observations/getSummarizedData.json',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                transformRequest: txformUrlEncoded,
                data: addCommonParams(params)
            }).success(function(response){
                success(response.filter(filterSuspectSummaryData));
            });
        },
        getObservationDates: function(params,success) {
            $http({
                method: 'POST',
                url: '/npn_portal/observations/getObservationDates.json',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                transformRequest: txformUrlEncoded,
                data: addCommonParams(params)
            }).success(success);
        },
        isFilterEmpty: FilterService.isFilterEmpty,
        getVisualizations: function() {
            return VISUALIZATIONS;
        },
        openSingleStationVisualization: function(station_id,vis) {
            setVisualizeSingleStationId(station_id);
            var modal_instance = service.openVisualization(vis);
            if(modal_instance) {
                // when modal instance closes should unset single station id.
                modal_instance.result.then(setVisualizeSingleStationId,setVisualizeSingleStationId);
            } else {
                setVisualizeSingleStationId();
            }
        },
        openVisualization: function(vis) {
            if(!FilterService.isFilterEmpty()) {
                return $modal.open({
                    templateUrl: vis.template,
                    controller: vis.controller,
                    windowClass: 'vis-dialog-window',
                    backdrop: 'static',
                    keyboard: false,
                    size: 'lg'
                });
            }
        }
    };
    return service;
}])
.directive('visDialog',[function(){
    return {
        restrict: 'E',
        templateUrl: 'js/vis/visDialog.html',
        transclude: true,
        scope: {
            title: '@',
            modal: '='
        },
        controller: ['$scope',function($scope) {
        }]
    };
}])
.directive('visControl',['ChartService',function(ChartService){
    return {
        restrict: 'E',
        templateUrl: 'js/vis/visControl.html',
        scope: {
        },
        controller: function($scope) {
            $scope.isFilterEmpty = ChartService.isFilterEmpty;
            $scope.open = ChartService.openVisualization;
            $scope.visualizations = ChartService.getVisualizations();
        }
    };
}])
.directive('visDownload',[function(){
    return {
        restrict: 'E',
        templateUrl: 'js/vis/visDownload.html',
        scope: {
            selector: '@',
            filename: '@'
        },
        controller: ['$scope',function($scope){
            $scope.download = function() {
                var chart = d3.select($scope.selector),
                    html = chart.attr('version', 1.1)
                                .attr('xmlns', 'http://www.w3.org/2000/svg')
                                .node().parentNode.innerHTML,
                    imgsrc = 'data:image/svg+xml;base64,'+ window.btoa(html),
                    canvas = document.querySelector('#visDownloadCanvas');
                canvas.width = chart.attr('width');
                canvas.height = chart.attr('height');

                var context = canvas.getContext('2d'),
                    image = new Image();
                image.onload = function() {
                    context.drawImage(image,0,0);
                    var canvasdata = canvas.toDataURL('image/png'),
                        a = $('#vis-download-link')[0];//document.createElement('a');
                    a.download = $scope.filename||'visualization.png';
                    a.href = canvasdata;
                    a.click();
                };
                image.src = imgsrc;
            };
        }]
    };
}]);