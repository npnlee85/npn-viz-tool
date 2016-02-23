/*
 * USANPN-Visualization-Tool
 * Version: 0.1.0 - 2016-02-23
 */

/**
 * @ngdoc overview
 * @name npn-viz-tool.bounds
 * @description
 *
 * Bounds related functionality.
 */
angular.module('npn-viz-tool.bounds',[
    'npn-viz-tool.filter',
    'uiGmapgoogle-maps'
])
/**
 * @ngdoc service
 * @name npn-viz-tool.bounds:RestrictedBoundsService
 * @module npn-viz-tool.bounds
 * @description
 *
 * Provides objects that can be used to handle Google Map 'center_changed' events to keep the user
 * from moving a map outside a set of defined boundaries.
 *
 * If you add the query argument <code>allowedBounds</code> to the app then the first time the user tries to
 * recenter the map a partially opaque white rectangle will be added to the map showing the bounds the given map
 * will be restricted to.
 */
.service('RestrictedBoundsService',['$log','$location','uiGmapGoogleMapApi',function($log,$location,uiGmapGoogleMapApi){
    var DEBUG = $location.search()['allowedBounds'],
        instances = {},
        service = {
            /**
             * @ngdoc method
             * @methodOf npn-viz-tool.bounds:RestrictedBoundsService
             * @name  getRestrictor
             * @description
             *
             * Fetch an object that can be used to keep a user from panning a map outside of a
             * set of defined bounds.
             *
             * E.g.
             * <pre>
             * var restrictor = RestrictedBoundsService.getRestrictor('main_map',latLngBounds);
             * $scope.map.events.center_changed = restrictor.center_changned;
             * </pre>
             *
             * @param {string} key A unique key to identifiy the map instance the restrictor is associated with.
             * @param {google.maps.LatLngBounds} bounds The initial set of bounds to restrict movements to.  Can be changed via setBounds.
             * @return {object} A "BoundsRestrictor" object.
             */
            getRestrictor: function(key,bounds) {
                if(!instances[key]) {
                    instances[key] = new BoundsRestrictor(key);
                }
                instances[key].setBounds(bounds);
                return instances[key];
            }
        };
    var BoundsRestrictor = function(key) {
        this.key = key;
        var self = this;
        self.center_changed = function(map,ename,args) {
            $log.debug('['+self.key+'].center_changed');
            if(!self.bounds) {
                $log.debug('['+self.key+'] no bounds set ignoring.');
                return;
            }
            if(DEBUG && !self.rectangle) {
                self.rectangle = new google.maps.Rectangle({
                    strokeColor: '#FFF',
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: '#FFF',
                    fillOpacity: 0.35,
                    map: map,
                    bounds: self.bounds
                });
            }
            if(self.bounds.contains(map.getCenter())) {
                self.lastValidCenter = map.getCenter();
                return;
            }
            $log.debug('['+self.key+'] attempted to pan center out of bounds, panning back to ',self.lastValidCenter);
            map.panTo(self.lastValidCenter);
        };
    };
    BoundsRestrictor.prototype.setBounds = function(newBounds) {
        $log.debug('['+this.key+'].setBounds:',newBounds);
        this.bounds = newBounds;
        this.lastValidCenter = newBounds ? newBounds.getCenter() : undefined;
        if(this.rectangle) {
            this.rectangle.setMap(null);
        }
        this.rectangle = undefined;
    };
    BoundsRestrictor.prototype.getBounds = function() {
        return this.bounds;
    };
    return service;
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.bounds:bounds-manager
 * @module npn-viz-tool.bounds
 * @description
 *
 * Handles the ability for users to draw rectangles on the main map and have it affect the underlying filter.
 */
.directive('boundsManager',['$rootScope','$log','uiGmapGoogleMapApi','FilterService','BoundsFilterArg',
    function($rootScope,$log,uiGmapGoogleMapApi,FilterService,BoundsFilterArg){
    return {
        restrict: 'E',
        template: '<ui-gmap-drawing-manager ng-if="!isFilterEmpty()" options="options" control="control"></ui-gmap-drawing-manager>',
        controller: ['$scope',function($scope) {
            $scope.isFilterEmpty = FilterService.isFilterEmpty;
            function refilter() {
                if(FilterService.getFilter().hasSufficientCriteria()) {
                    $rootScope.$broadcast('filter-rerun-phase2',{});
                }
            }
            uiGmapGoogleMapApi.then(function(maps) {
                var mapsApi = maps,
                    dcOptions = {
                        drawingModes: [mapsApi.drawing.OverlayType.RECTANGLE],
                        position: mapsApi.ControlPosition.TOP_RIGHT,
                        drawingControl: false
                    };
                $log.debug('api',maps);
                $scope.options = {
                    drawingControlOptions: dcOptions,
                    rectangleOptions: BoundsFilterArg.RECTANGLE_OPTIONS
                };
                $scope.control = {};
                $scope.$on('bounds-filter-ready',function(event,data){
                    mapsApi.event.addListener(data.filter.arg,'mouseover',function(){
                        data.filter.arg.setOptions(angular.extend({},BoundsFilterArg.RECTANGLE_OPTIONS,{strokeWeight: 2}));
                    });
                    mapsApi.event.addListener(data.filter.arg,'mouseout',function(){
                        data.filter.arg.setOptions(BoundsFilterArg.RECTANGLE_OPTIONS);
                    });
                    mapsApi.event.addListener(data.filter.arg,'rightclick',function(){
                        FilterService.removeFromFilter(data.filter);
                        refilter();
                    });
                });
                $scope.$watch('control.getDrawingManager',function(){
                    if($scope.control.getDrawingManager){
                        var drawingManager = $scope.control.getDrawingManager();
                        mapsApi.event.addListener(drawingManager,'rectanglecomplete',function(rectangle){
                            drawingManager.setDrawingMode(null);
                            FilterService.addToFilter(new BoundsFilterArg(rectangle));
                            refilter();
                        });
                        $scope.$on('filter-reset',function(event,data){
                            dcOptions.drawingControl = false;
                            drawingManager.setOptions(dcOptions);
                        });
                        $scope.$on('filter-update',function(event,data){
                            dcOptions.drawingControl = FilterService.hasSufficientCriteria();
                            drawingManager.setOptions(dcOptions);
                        });
                    }
                });

            });
        }]
    };
}]);
angular.module('npn-viz-tool.vis-cache',[
    'angular-md5'
])
/**
 * CacheService
 * Supports a generic place where code can put data that shouldn't be fetched from the
 * server repeatedly, default time to live on data is 5 minutes.
 **/
.factory('CacheService',['$log','$timeout','md5',function($log,$timeout,md5){
    var cache = [];
    var service = {
      keyFromObject : function(obj) {
        return md5.createHash(JSON.stringify(obj));
      },
      dump : function() {
        $log.debug('cache',cache);
      },
      put : function(key,obj) {
        if ( key == null ) {
          return;
        }
        if ( obj == null ) {
          $log.debug( 'removing cached object \''+key+'\'', cache[key]);
          // probably should slice to shrink cache array but...
          cache[key] = null;
          return;
        }
        var ttl = (arguments.length > 2) ?
          arguments[2] :
          (5*60000); // default ttl is 5 minutes
        var expiry = (ttl < 0) ?
          -1 : // never expires
          (new Date()).getTime()+ttl;
        $log.debug('caching (expiry:'+expiry+') \''+key+'\'',obj);
        cache[key] = {
          data: obj,
          expiry : expiry
        };
        if(ttl > 0) {
            $timeout(function(){
                $log.debug('expiring cached object \''+key+'\'', cache[key]);
                cache[key] = null;
            },ttl);
        }
      },
      get : function(key) {
        var obj = cache[key];
        if ( obj == null ) {
          return arguments.length > 1 ? arguments[1] : null;
        }
        if ( obj.expiry < 0 || obj.expiry > (new Date()).getTime() ) {
            $log.debug('cache entry \''+key+'\' is valid returning.');
          return obj.data;
        }
        $log.debug('cache entry \''+key+'\' has expired.');
        // probably should slice to shrink cache array but...
        delete cache[key];
        return arguments.length > 1 ? arguments[1] : null;
      }
    };
    return service;
}]);
angular.module('npn-viz-tool.vis-calendar',[
    'npn-viz-tool.vis',
    'npn-viz-tool.filter',
    'npn-viz-tool.filters',
    'ui.bootstrap'
])
.controller('CalendarVisCtrl',['$scope','$uibModalInstance','$http','$timeout','$filter','$log','FilterService','ChartService',
    function($scope,$uibModalInstance,$http,$timeout,$filter,$log,FilterService,ChartService){
    var response, // raw response from the server
        data, // processed data from the server
        dateArg = FilterService.getFilter().getDateArg(),
        sizing = ChartService.getSizeInfo({top: 20, right: 35, bottom: 35, left: 35}),
        chart,
        d3_month_fmt = d3.time.format('%B'),
        x = d3.scale.ordinal().rangeBands([0,sizing.width]).domain(d3.range(1,366)),
        xAxis = d3.svg.axis().scale(x).orient('bottom').tickValues(xTickValues()).tickFormat(formatXTickLabels),
        y = d3.scale.ordinal().rangeBands([sizing.height,0]).domain(d3.range(0,6)),
        yAxis = d3.svg.axis().scale(y).orient('right').tickSize(sizing.width).tickFormat(function(d) {
            return d;
        }).tickFormat(formatYTickLabels);

    $scope.validYears = d3.range(1900,((new Date()).getFullYear()+1));
    $scope.modal = $uibModalInstance;

    var colorScale = FilterService.getColorScale();
    $scope.colors = colorScale.domain();
    $scope.colorRange = colorScale.range();

    $scope.selection = {
        color: 0,
        year: (new Date()).getFullYear(),
        netagive: false,
    };

    $scope.toPlotYears = [];
    $scope.toPlot = [];
    FilterService.getFilter().getSpeciesList().then(function(list){
        $log.debug('speciesList',list);
        $scope.speciesList = list;
        if(list.length) {
            $scope.selection.species = list[0];
        }
    });
    $scope.$watch('selection.species',function(){
        $scope.phenophaseList = [];
        if($scope.selection.species) {
            FilterService.getFilter().getPhenophasesForSpecies($scope.selection.species.species_id).then(function(list){
                $log.debug('phenophaseList',list);
                if(list.length) {
                    list.splice(0,0,{phenophase_id: -1, phenophase_name: 'All phenophases'});
                }
                $scope.phenophaseList = list;
                if(list.length) {
                    $scope.selection.phenophase = list[0];
                }
            });
        }
    });
    function advanceColor() {
        if($scope.selection.color < $scope.colors.length) {
            $scope.selection.color++;
        } else {
            $scope.selection.color = 0;
        }
    }
    function addToPlot(toPlot) {
        $log.debug('addToPlot',toPlot);
        if(toPlot) {
            if(toPlot.phenophase_id === -1) {
                $log.debug('add all phenophases...');
                removeSpeciesFromPlot(toPlot.species_id);
                $scope.phenophaseList.filter(function(p){
                    return p.phenophase_id !== -1;
                }).forEach(function(pp) {
                    addToPlot(angular.extend($scope.selection.species,pp));
                });
            } else {
                $scope.toPlot.push(getNewToPlot(toPlot));
                advanceColor();
            }
            $scope.data = data = undefined;
        }
    }
    function getNewToPlot(tp) {
        var base = tp||angular.extend({},$scope.selection.species,$scope.selection.phenophase);
        return angular.extend({},base,{color: $scope.selection.color});
    }
    $scope.canAddToPlot = function() {
        if(!$scope.selection.species || !$scope.selection.phenophase) {
            return false;
        }
        if($scope.toPlot.length === 0) {
            return true;
        }
        var next = getNewToPlot(),i;
        for(i = 0; i < $scope.toPlot.length; i++) {
            if(angular.equals($scope.toPlot[i],next)) {
                return false;
            }
        }
        for(i = 0; i < $scope.toPlot.length; i++) {
            if(next.color === $scope.toPlot[i].color) {
                return false;
            }
        }
        return true;
    };
    $scope.addToPlot = function() {
        addToPlot(getNewToPlot());
    };
    $scope.removeFromPlot = function(idx) {
        $scope.toPlot.splice(idx,1);
        $scope.data = data = undefined;
    };
    function removeSpeciesFromPlot(species_id) {
        for(;;){
            var idx = -1,i;
            for(i = 0; i < $scope.toPlot.length; i++) {
                if($scope.toPlot[i].species_id === species_id) {
                    idx = i;
                    break;
                }
            }
            if(idx === -1) {
                break;
            } else {
                $scope.removeFromPlot(idx);
            }
        }
    }

    $scope.addYear = function() {
        if($scope.selection.year) {
            $scope.toPlotYears.push($scope.selection.year);
            $scope.toPlotYears.sort();
            $scope.data = data = undefined;
        }
    };
    $scope.canAddYear = function() {
        return $scope.toPlotYears.length < 2 && // no more than 2
               $scope.selection.year && // anything to add?
               $scope.toPlotYears.indexOf($scope.selection.year) === -1 && // already added?
               $scope.validYears.indexOf($scope.selection.year) !== -1; // valid to add period?
    };
    $scope.removeYear = function(idx) {
        $scope.toPlotYears.splice(idx,1);
        $scope.data = data = undefined;
    };

    function commonChartUpdates() {
        var chart = d3.select('.chart');

        chart.selectAll('g .y.axis line')
            .style('stroke','#777')
            .style('stroke-dasharray','2,2');

        chart.selectAll('.axis path')
            .style('fill','none')
            .style('stroke','#000')
            .style('shape-rendering','crispEdges');
        chart.selectAll('.axis line')
            .style('fill','none')
            .style('stroke','#000')
            .style('shape-rendering','crispEdges');

        chart.selectAll('text')
            .style('font-family','Arial');
    }

    // can't initialize the chart until the dialog is rendered so postpone its initialization a short time.
    $timeout(function(){
        var svg = d3.select('.chart')
            .attr('width', sizing.width + sizing.margin.left + sizing.margin.right)
            .attr('height', sizing.height + sizing.margin.top + sizing.margin.bottom);
        svg.append('g').append('rect').attr('width','100%').attr('height','100%').attr('fill','#fff');

        chart = svg
          .append('g')
            .attr('transform', 'translate(' + sizing.margin.left + ',' + sizing.margin.top + ')');

          chart.append('g')
              .attr('class', 'x axis')
              .attr('transform', 'translate(0,' + sizing.height + ')')
              .call(xAxis);

          chart.append('g')
              .attr('class', 'y axis')
              .call(yAxis)
              .call(moveYTickLabels);
          chart.selectAll('g .x.axis text')
            .attr('style','font-size: 12px');

          // hide y axis
          chart.selectAll('g .y.axis path')
            .style('display','none');

          commonChartUpdates();
    },500);


    $scope.yAxisConfig = {
        labelOffset: 4,
        bandPadding: 0.5,
        fontSize: 12
    };
    function moveYTickLabels(g) {
      var dy = -1*((y.rangeBand()/2)+$scope.yAxisConfig.labelOffset);
      g.selectAll('text')
          .attr('x', 0)
          .attr('dy', dy)
          .attr('style', 'text-anchor: start; font-size: '+$scope.yAxisConfig.fontSize+'px;');
    }
    function updateYAxis(){
        y.rangeBands([sizing.height,0],$scope.yAxisConfig.bandPadding,0.5);
        if(data && data.labels) {
            y.domain(d3.range(0,data.labels.length));
        }
        yAxis.scale(y);
        if(chart) {
            chart.selectAll('g .y.axis').call(yAxis).call(moveYTickLabels);
        }
    }
    $scope.$watch('yAxisConfig.labelOffset',draw);
    $scope.$watch('yAxisConfig.bandPadding',draw);
    $scope.$watch('yAxisConfig.fontSize',draw);
    function addFloatFixed(v,add,precision) {
        var n = v+add;
        return Number(n.toFixed(precision));
    }
    $scope.incrBandPadding = function() {
        $scope.yAxisConfig.bandPadding = addFloatFixed($scope.yAxisConfig.bandPadding,0.05,2);
    };
    $scope.decrBandPadding = function() {
        $scope.yAxisConfig.bandPadding = addFloatFixed($scope.yAxisConfig.bandPadding,-0.05,2);
    };
    $scope.incrFontSize = function() {
        $scope.yAxisConfig.fontSize++;// = addFloatFixed($scope.yAxisConfig.fontSize,-0.05,2);
    };
    $scope.decrFontSize = function() {
        $scope.yAxisConfig.fontSize--;// = addFloatFixed($scope.yAxisConfig.fontSize,0.05,2);
    };

    function formatYTickLabels(i) {
        return (data && data.labels && i < data.labels.length ) ? data.labels[i] : '';
    }

    // the doy of the first of each month doesn't change from year to year just what
    // day of the week days fall on so what year is used to calculate them is irrelevant
    function xTickValues() {
        var firsts = [1],i,count = 1;
        for(i = 1; i < 12; i++) {
            var date = new Date(1900,i);
            // back up 1 day
            date.setTime(date.getTime()-ChartService.ONE_DAY_MILLIS);
            count += date.getDate();
            firsts.push(count);
        }
        return x.domain().filter(function(d){
            return firsts.indexOf(d) !== -1;
        });
    }
    function formatXTickLabels(i) {
        var date = new Date(1900,0);
        date.setTime(date.getTime()+(ChartService.ONE_DAY_MILLIS*i));
        return d3_month_fmt(date);
    }

    var negativeColor = '#aaa';

    function draw() {
        if(!data) {
            return;
        }
        $scope.working = true;
        // update the x-axis
        // since each doy is an independent line depending on the x rangeband with, etc.
        // at some sizes lines drawn side by side for subsequent days might have a tiny bit of
        // whitespace between them which isn't desired since we want them to appear as a solid band
        // SO doing two things; using a tiny but negative padding AND rounding up dx (below).
        x.rangeBands([0,sizing.width],-0.1,0.5);
        xAxis.scale(x);
        chart.selectAll('g .x.axis').call(xAxis);
        // update the y-axis
        updateYAxis();

        var doys = chart.selectAll('.doy').data(data.data,function(d){ return d.y+'-'+d.x+'-'+d.color; });
        doys.exit().remove();
        doys.enter().insert('line',':first-child').attr('class','doy');

        var dx = Math.ceil(x.rangeBand()/2),
            dy = y.rangeBand()/2;

        doys.attr('x1', function(d) { return x(d.x)-dx; })
            .attr('y1', function(d,i) { return y(d.y)+dy; })
            .attr('x2', function(d) { return x(d.x)+dx; })
            .attr('y2', function(d,i) { return y(d.y)+dy; })
            .attr('doy-point',function(d) { return '('+d.x+','+d.y+')'; })
            .attr('stroke', function(d) { return d.color === negativeColor ? negativeColor : $scope.colorRange[d.color]; })
            .attr('stroke-width', y.rangeBand())
            .append('title')
            .text(function(d) {
                return d.x; // x is the doy
            });

        commonChartUpdates();

        $scope.working = false;
    }

    function updateData() {
        if(!response) {
            return;
        }
        if(response.error_message) {
            $log.warn('Received error',response);
            $scope.error_message = response.error_message;
            $scope.working = false;
            return;
        }
        var speciesMap = {},toChart = {
            labels:[],
            data:[]
        },
        // starting with the largest y and decrementing down because we want to display
        // the selected data in that order (year1/1st pair, year2/1st pair, ..., year2/last pair)
        y = ($scope.toPlot.length*$scope.toPlotYears.length)-1;

        // translate arrays into maps
        angular.forEach(response,function(species){
            speciesMap[species.species_id] = species;
            var ppMap = {};
            angular.forEach(species.phenophases,function(pp){
                ppMap[pp.phenophase_id] = pp;
            });
            species.phenophases = ppMap;
        });

        $log.debug('speciesMap',speciesMap);
        function addDoys(doys,color) {
            angular.forEach(doys,function(doy){
                toChart.data.push({
                    y: y,
                    x: doy,
                    color: color
                });
            });
        }
        angular.forEach($scope.toPlot,function(tp){
            $log.debug('toPlot',tp);
            var species = speciesMap[tp.species_id],
                phenophase = species.phenophases[tp.phenophase_id];
            angular.forEach($scope.toPlotYears,function(year){
                if(phenophase && phenophase.years && phenophase.years[year]) {
                    // conditionally add negative data
                    if($scope.selection.negative) {
                        $log.debug('year negative',y,year,species.common_name,phenophase,phenophase.years[year].negative);
                        addDoys(phenophase.years[year].negative,negativeColor);
                    }
                    // add positive data
                    $log.debug('year positive',y,year,species.common_name,phenophase,phenophase.years[year].positive);
                    addDoys(phenophase.years[year].positive,tp.color);
                }
                toChart.labels.splice(0,0,$filter('speciesTitle')(tp)+'/'+tp.phenophase_name+' ('+year+')');
                $log.debug('y of '+y+' is for '+toChart.labels[0]);
                y--;
            });
        });
        $scope.data = data = toChart;
        $log.debug('calendar data',data);
        draw();
    }
    $scope.$watch('selection.negative',updateData);

    $scope.visualize = function() {
        if(data) {
            return draw();
        }
        $scope.working = true;
        $log.debug('visualize',$scope.selection.axis,$scope.toPlot);
        var dateArg = FilterService.getFilter().getDateArg(),
            params = {
                request_src: 'npn-vis-calendar'
            },
            colorMap = {};
        $scope.toPlotYears.forEach(function(d,i){
            params['year['+i+']'] = d;
        });
        angular.forEach($scope.toPlot,function(tp,i) {
            colorMap[tp.species_id+'.'+tp.phenophase_id] = tp.color;
            params['species_id['+i+']'] = tp.species_id;
            params['phenophase_id['+i+']'] = tp.phenophase_id;
        });
        $scope.error_message = undefined;
        ChartService.getObservationDates(params,function(serverResponse){
            response = serverResponse;
            updateData();
        });
    };
}]);
angular.module('npn-viz-tool.cluster',[
])
.factory('ClusterService',[function(){
    var service = {
        getDefaultClusterOptions: function() {
            var styles = [0,1,2,4,8,16,32,64,128,256].map(function(i){
                return {
                    n: (i*1000),
                    url: 'cluster/m'+i+'.png',
                    width: 52,
                    height: 52,
                    textColor: '#fff'
                };
            });
            return {
                styles: styles,
                maxZoom: 12
            };
        }
    };
    return service;
}]);
angular.module('npn-viz-tool.export',[
    'npn-viz-tool.filter'
])
.directive('exportControl',['$log','$http','$window','FilterService',function($log,$http,$window,FilterService){
    return {
        restrict: 'E',
        template: '<a title="Export" href id="export-control" class="btn btn-default btn-xs" ng-disabled="!getFilteredMarkers().length" ng-click="exportData()"><i class="fa fa-download"></i></a>',
        controller: ['$scope',function($scope){
            $scope.getFilteredMarkers = FilterService.getFilteredMarkers;
            $scope.exportData = function() {
                var filter = FilterService.getFilter();
                var params = {
                    date: filter.getDateArg().toExportParam()
                };
                if(filter.getSpeciesArgs().length) {
                    params.species = [];
                    filter.getSpeciesArgs().forEach(function(s){
                        params.species.push(s.toExportParam());
                    });
                }
                if(filter.getNetworkArgs().length) {
                    params.networks = [];
                    filter.getNetworkArgs().forEach(function(n){
                        params.networks.push(n.toExportParam());
                    });
                }
                if(filter.getGeographicArgs().length) {
                    params.stations = [];
                    FilterService.getFilteredMarkers().forEach(function(marker,i){
                        params.stations.push(marker.station_id);
                    });
                }
                $log.debug('export.params',params);
                $http({
                    method: 'POST',
                    url: '/ddt/observations/setSearchParams',
                    data: params
                }).success(function(){
                    $window.open('/results/visualization/data');
                });
            };
        }]
    };
}]);
angular.module('npn-viz-tool.filter',[
    'npn-viz-tool.settings',
    'npn-viz-tool.stations',
    'npn-viz-tool.cluster',
    'npn-viz-tool.vis-cache',
    'npn-viz-tool.help',
    'angular-md5',
    'isteven-multi-select'
])
/**
 * Base class for any part of the  base filter
 */
.factory('FilterArg',[function(){
    /**
     * Base abstract constructor.
     * @param {[type]} arg An opaque object this filter argument wraps (e.g. a species, date range or GeoJson feature object)
     */
    var FilterArg = function(arg) {
        this.arg = arg;
    };
    FilterArg.prototype.getArg = function() {
        return this.arg;
    };
    FilterArg.prototype.$filter = function(input) {
        return true;
    };
    FilterArg.prototype.$removed = function() {
    };
    return FilterArg;
}])
.factory('DateFilterArg',['FilterArg',function(FilterArg){
    /**
     * Constructs a DateFilterArg.  This type of arg is used server side only (on input parameters)
     * and as such does not over-ride $filter.
     *
     * @param {Object} range {start_date: <year>, end_date: <year>}
     */
    var DateFilterArg = function(range) {
        if(range) {
            if(range.start_date && typeof(range.start_date) !== 'number') {
                range.start_date = parseInt(range.start_date);
            }
            if(range.end_date && typeof(range.end_date) !== 'number') {
                range.end_date = parseInt(range.end_date);
            }
        }
        FilterArg.apply(this,arguments);
    };
    DateFilterArg.prototype.getId = function() {
        return 'date';
    };
    DateFilterArg.prototype.getStartYear = function() {
        return this.arg.start_date;
    };
    DateFilterArg.prototype.getStartDate = function() {
        return this.arg.start_date+'-01-01';
    };
    DateFilterArg.prototype.getEndYear = function() {
        return this.arg.end_date;
    };
    DateFilterArg.prototype.getEndDate = function() {
        return this.arg.end_date+'-12-31';
    };
    DateFilterArg.prototype.toExportParam = function() {
        return {
            start: this.arg.start_date,
            end: this.arg.end_date
        };
    };
    DateFilterArg.prototype.toString = function() {
        return this.arg.start_date+'-'+this.arg.end_date;
    };
    DateFilterArg.fromString = function(s) {
        var dash = s.indexOf('-');
        return new DateFilterArg({
                start_date: s.substring(0,dash),
                end_date: s.substring(dash+1)
            });
    };
    return DateFilterArg;
}])
.factory('NetworkFilterArg',['$http','$rootScope','$log','FilterArg','SpeciesFilterArg',function($http,$rootScope,$log,FilterArg,SpeciesFilterArg){
    /**
     * Constructs a NetworkFilterArg.  TODO over-ride $filter??
     *
     * @param {Object} A network record as returned by getPartnerNetworks.json.
     */
    var NetworkFilterArg = function(network) {
        FilterArg.apply(this,arguments);
        this.counts = {
            station: '?',
            observation: '?'
        };
        this.stations = [];
        var self = this;
        $rootScope.$broadcast('network-filter-ready',{filter:self});
    };
    NetworkFilterArg.prototype.getId = function() {
        return parseInt(this.arg.network_id);
    };
    NetworkFilterArg.prototype.getName = function() {
        return this.arg.network_name;
    };	
    NetworkFilterArg.prototype.toExportParam = function() {
        return this.getId();
    };
    NetworkFilterArg.prototype.toString = function() {
        return this.arg.network_id;
    };
    NetworkFilterArg.prototype.resetCounts = function(c) {
        this.counts.station = this.counts.observation = c;
        this.stations = [];
    };
    NetworkFilterArg.prototype.updateCounts = function(station,species) {
        var id = this.getId(),pid;
        if(station.networks.indexOf(id) !== -1) {
            // station is IN this network
            if(this.stations.indexOf(station.station_id) === -1) {
                // first time we've seen this station.
                this.stations.push(station.station_id);
                this.counts.station++;
            }
            // TODO, how to know which phenophases to add to counts??
            for(pid in species) {
                if(species[pid].$match) { // matched some species/phenophase filter
                    this.counts.observation += SpeciesFilterArg.countObservationsForPhenophase(species[pid]);
                }
            }
        }
    };
    NetworkFilterArg.fromString = function(s) {
        // TODO can I just fetch a SINGLE network??  the network_id parameter of
        // getPartnerNetworks.json doesn't appear to work.
        return $http.get('/npn_portal/networks/getPartnerNetworks.json',{
            params: {
                active_only: true,
                // network_id: s
            }
        }).then(function(response){
            var nets = response.data;
            for(var i = 0; nets && i  < nets.length; i++) {
                if(s === nets[i].network_id) {
                    return new NetworkFilterArg(nets[i]);
                }
            }
            $log.warn('NO NETWORK FOUND WITH ID '+s);
        });
    };
    return NetworkFilterArg;
}])
.factory('SpeciesFilterArg',['$http','$rootScope','$log','FilterArg',function($http,$rootScope,$log,FilterArg){
    /**
     * Constructs a SpeciesFilterArg.  This type of arg spans both side of the wire.  It's id is used as input
     * to web services and its $filter method deals with post-processing phenophase filtering.  It exposes additional
     * top level attributes; count:{station:?,observation:?}, phenophases (array) and phenophaseMap (map).  Upon instantiation
     * phenophases are chased.
     *
     * @param {Object} species A species record as returned by getSpeciesFilter.json.
     */
    var SpeciesFilterArg = function(species,selectedPhenoIds) {
        FilterArg.apply(this,arguments);
        this.counts = {
            station: '?',
            observation: '?'
        };
        if(selectedPhenoIds && selectedPhenoIds != '*') {
            this.phenophaseSelections = selectedPhenoIds.split(',');
        }
        var self = this;
        $http.get('/npn_portal/phenophases/getPhenophasesForSpecies.json',{ // cache ??
                params: {
                    return_all: true,
                    //date: FilterService.getDate().end_date+'-12-31',
                    species_id: self.arg.species_id
                }
            }).success(function(phases) {
                var seen = {}; // the call returns redundant data so filter it out.
                self.phenophases = phases[0].phenophases.filter(function(pp){
                    if(seen[pp.phenophase_id]) {
                        return false;
                    }
                    seen[pp.phenophase_id] = pp;
                    pp.selected = !self.phenophaseSelections || self.phenophaseSelections.indexOf(pp.phenophase_id) != -1;
                    return true;
                });
                self.phenophasesMap = {}; // create a map for faster lookup during filtering.
                angular.forEach(self.phenophases,function(pp){
                    self.phenophasesMap[pp.phenophase_id] = pp;
                });
                $rootScope.$broadcast('species-filter-ready',{filter:self});
            });
    };
    SpeciesFilterArg.countObservationsForPhenophase = function(phenophase) {
        var n = 0;
        if(phenophase.y) {
            n += phenophase.y;
        }
        if(phenophase.n) {
            n += phenophase.n;
        }
        if(phenophase.q) {
            n += phenophase.q;
        }
        return n;
    };
    SpeciesFilterArg.prototype.getId = function() {
        return parseInt(this.arg.species_id);
    };
    SpeciesFilterArg.prototype.getPhenophaseList = function() {
        return angular.copy(this.phenophases);
    };
    SpeciesFilterArg.prototype.resetCounts = function(c) {
        this.counts.station = this.counts.observation = c;
        angular.forEach(this.phenophases,function(pp){
            pp.count = 0;
        });
    };
    SpeciesFilterArg.prototype.$filter = function(species) {
        var self = this,
            hitCount = 0,
            filtered = Object.keys(species).filter(function(pid){
                if(!self.phenophasesMap[pid]) {
                    $log.error('phenophase_id: ' + pid + ' not found for species: ' + self.arg.species_id);
                    return false;
                }
                var oCount = SpeciesFilterArg.countObservationsForPhenophase(species[pid]);
                self.phenophasesMap[pid].count += oCount;
                // LEAKY this $match is something that the NetworkFilterArg uses to decide which
                // observations to include in its counts
                species[pid].$match = self.phenophasesMap[pid].selected;
                if(species[pid].$match) {
                    hitCount += oCount;
                }
                return species[pid].$match;
            });
        if(filtered.length > 0) {
            self.counts.station++;
        }
        self.counts.observation += hitCount;
        return hitCount;
    };
    SpeciesFilterArg.prototype.toExportParam = function() {
        var r = {
            species_id: this.getId(),
            common_name: this.arg.common_name
        },
        selected = this.phenophases.filter(function(pp){
                return pp.selected;
        });
        if(selected.length !== this.phenophases.length) {
            r.phenophases = selected.map(function(pp){ return parseInt(pp.phenophase_id); });
        }
        return r;
    };
    SpeciesFilterArg.prototype.toString = function() {
        var s = this.arg.species_id+':',
            selected = this.phenophases.filter(function(pp){
                return pp.selected;
            });
        if(selected.length === this.phenophases.length) {
            s += '*';
        } else {
            selected.forEach(function(pp,i){
                s += (i>0?',':'')+pp.phenophase_id;
            });
        }
        return s;
    };
    SpeciesFilterArg.fromString = function(s) {
        var colon = s.indexOf(':'),
            sid = s.substring(0,colon),
            ppids = s.substring(colon+1);
        return $http.get('/npn_portal/species/getSpeciesById.json',{
            params: {
                species_id: sid
            }
        }).then(function(response){
            // odd that this ws call doesn't return the species_id...
            response.data['species_id'] = sid;
            return new SpeciesFilterArg(response.data,ppids);
        });
    };
    return SpeciesFilterArg;
}])
.factory('GeoFilterArg',['FilterArg',function(FilterArg){
    function geoContains(point,geo) {
        var polyType = geo.getType(),
            poly,arr,i;
        if(polyType == 'Polygon') {
            // this seems wrong but some GeoJson data has more than one index in geo.getArray() for Polygon
            // as if it were a 'MultiPolygon'...
            arr = geo.getArray();
            for(i = 0; i < arr.length; i++) {
                poly = new google.maps.Polygon({paths: arr[i].getArray()});
                if (google.maps.geometry.poly.containsLocation(point,poly) || google.maps.geometry.poly.isLocationOnEdge(point,poly)) {
                    return true;
                }
            }
            /*
            poly = new google.maps.Polygon({paths: geo.getArray()[0].getArray()});
            return google.maps.geometry.poly.containsLocation(point,poly) ||
                   google.maps.geometry.poly.isLocationOnEdge(point,poly);*/
        } else if (polyType === 'MultiPolygon' || polyType == 'GeometryCollection') {
            arr = geo.getArray();
            for(i = 0; i < arr.length; i++) {
                if(geoContains(point,arr[i])) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Constructs a GeoFilterArg.  This is just a post-processing type of filter argument which tests
     * to see if markers (stations) are within a GeoJson feature (Polygon or set of Polygons).
     *
     * @param {Object} feature A Google Maps GeoJson Feature object.
     */
    var GeoFilterArg = function(feature,sourceId){
        FilterArg.apply(this,arguments);
        this.sourceId = sourceId;
    };
    GeoFilterArg.prototype.getId = function() {
        return this.arg.getProperty('NAME');
    };
    GeoFilterArg.prototype.getSourceId = function() {
        return this.sourceId;
    };
    GeoFilterArg.prototype.getUid = function(){
        return this.getSourceId()+'-'+this.getId();
    };
    GeoFilterArg.prototype.$filter = function(marker) {
        return geoContains(new google.maps.LatLng(parseFloat(marker.latitude), parseFloat(marker.longitude)),this.arg.getGeometry());
    };
    GeoFilterArg.prototype.toString = function() {
        return this.sourceId+':'+this.arg.getProperty('NAME');
    };
    return GeoFilterArg;
}])
.factory('BoundsFilterArg',['$rootScope','FilterArg',function($rootScope,FilterArg){
    /**
     * Constructs a BoundsFilterArg.  This is just a post-processing type of filter argument which tests
     * to see if markers (stations) are within a bounding box.
     *
     * @param {Object} rectangle A Google Maps Rectangle object.
     */
    var BoundsFilterArg = function(rectangle){
        FilterArg.apply(this,arguments);
        var self = this;
        $rootScope.$broadcast('bounds-filter-ready',{filter:self});
    };
    BoundsFilterArg.RECTANGLE_OPTIONS = {
        strokeColor: '#fff',
        strokeWeight: 1,
        fillColor: '#000080',
        fillOpacity: 0.5,
        visible: true,
        zIndex: 1
    };
    BoundsFilterArg.prototype.getId = function() {
        return this.arg.getBounds().getCenter().toString();
    };
    BoundsFilterArg.prototype.getUid = function() {
        return this.getId();
    };
    BoundsFilterArg.prototype.$filter = function(marker) {
        return this.arg.getBounds().contains(new google.maps.LatLng(parseFloat(marker.latitude), parseFloat(marker.longitude)));
    };
    BoundsFilterArg.prototype.$removed = function() {
        this.arg.setMap(null);
    };
    BoundsFilterArg.prototype.toString = function() {
        var bounds = this.arg.getBounds(),
            sw = bounds.getSouthWest(),
            ne = bounds.getNorthEast(),
            digits = 4;
        return sw.lat().toFixed(digits)+','+sw.lng().toFixed(digits)+':'+ne.lat().toFixed(digits)+','+ne.lng().toFixed(digits);
    };
    BoundsFilterArg.fromString = function(s,map) {
        var parts = s.split(':'),
            sw_parts = parts[0].split(','),
            sw = new google.maps.LatLng(parseFloat(sw_parts[0]),parseFloat(sw_parts[1])),
            ne_parts = parts[1].split(','),
            ne = new google.maps.LatLng(parseFloat(ne_parts[0]),parseFloat(ne_parts[1])),
            bounds = new google.maps.LatLngBounds(sw,ne),
            rect = new google.maps.Rectangle(BoundsFilterArg.RECTANGLE_OPTIONS);
        rect.setBounds(bounds);
        rect.setMap(map);
        return new BoundsFilterArg(rect);
    };
    return BoundsFilterArg;
}])
.factory('NpnFilter',[ '$q','$http','DateFilterArg','SpeciesFilterArg','NetworkFilterArg','GeoFilterArg','BoundsFilterArg','CacheService',
    function($q,$http,DateFilterArg,SpeciesFilterArg,NetworkFilterArg,GeoFilterArg,BoundsFilterArg,CacheService){
    function getValues(map) {
        var vals = [],key;
        for(key in map) {
            vals.push(map[key]);
        }
        return vals;
    }
    /**
     * Constructs an NpnFilter.  An NpnFilter has multiple different parts.  A single date range (DateFilterArg),
     * a list of 1 or more species (SpeciesFilterArg) and zero or more geographic filters (GeoFilterArgs).
     */
    var NpnFilter = function(){
        this.reset();
    };
    NpnFilter.prototype.hasDate = function() {
        return !!this.date;
    };
    NpnFilter.prototype.hasCriteria = function() {
        if(this.date) {
            return true;
        }
        return Object.keys(this.species).length > 0 || Object.keys(this.networks).length > 0;
    };
    NpnFilter.prototype.hasSufficientCriteria = function() {
        return this.date && (Object.keys(this.species).length > 0 || Object.keys(this.networks).length > 0);
    };
    NpnFilter.prototype.getUpdateCount = function() {
        return this.updateCount;
    };
    NpnFilter.prototype.getDateArg = function() {
        return this.date;
    };
    NpnFilter.prototype.getSpeciesArg = function(id) {
        return this.species[id];
    };
    NpnFilter.prototype.getSpeciesArgs = function() {
        return getValues(this.species);
    };
    NpnFilter.prototype.getNetworkArg = function(id) {
        return this.networks[id];
    };
    NpnFilter.prototype.getNetworkArgs = function() {
        return getValues(this.networks);
    };
    NpnFilter.prototype.getCriteria = function() {
        var criteria = getValues(this.species);
        if(this.date) {
            criteria.append(this.date);
        }
        return criteria;
    };
    NpnFilter.prototype.getGeoArgs = function() {
        return getValues(this.geo);
    };
    NpnFilter.prototype.getBoundsArgs = function() {
        return getValues(this.bounds);
    };
    NpnFilter.prototype.getGeographicArgs = function() {
        return this.getBoundsArgs().concat(this.getGeoArgs());
    };
    NpnFilter.prototype.add = function(item) {
        this.updateCount++;
        if(item instanceof DateFilterArg) {
            this.date = item;
        } else if (item instanceof SpeciesFilterArg) {
            this.species[item.getId()] = item;
        } else if (item instanceof NetworkFilterArg) {
            this.networks[item.getId()] = item;
        } else if (item instanceof GeoFilterArg) {
            this.geo[item.getId()] = item;
        } else if (item instanceof BoundsFilterArg) {
            this.bounds[item.getId()] = item;
        }
        return (!(item instanceof GeoFilterArg));
    };
    NpnFilter.prototype.remove = function(item) {
        this.updateCount++;
        if(item instanceof DateFilterArg) {
            this.date = undefined;
            // removal of date invalidates filter.
            this.species = {};
            this.networks = {};
            this.bounds = {};
        } else if(item instanceof SpeciesFilterArg) {
            delete this.species[item.getId()];
        } else if(item instanceof NetworkFilterArg){
            delete this.networks[item.getId()];
        } else if(item instanceof GeoFilterArg) {
            delete this.geo[item.getId()];
        } else if(item instanceof BoundsFilterArg) {
            delete this.bounds[item.getId()];
        }
        if(item.$removed) {
            item.$removed();
        }
        return (!(item instanceof GeoFilterArg) && !(item instanceof BoundsFilterArg));
    };
    function _reset(argMap) {
        if(argMap) {
            Object.keys(argMap).forEach(function(key){
                if(argMap[key].$removed) {
                    argMap[key].$removed();
                }
            });
        }
        return {};
    }
    NpnFilter.prototype.reset = function() {
        this.updateCount = 0;
        this.date = undefined;
        this.species = _reset(this.species);
        this.geo = _reset(this.geo);
        this.networks = _reset(this.networks);
        this.bounds = _reset(this.bounds);
    };

    /**
     * Fetches a list of species objects that correspond to this filter.  If the filter
     * has species args in it already then the contents of those args constitute the result.
     * If the filter has a list of networks then the list of species are those applicable to those
     * networks.
     * @return {Promise} A promise that will be resolved with the list.
     */
    NpnFilter.prototype.getSpeciesList = function() {
        var list = [],
            speciesArgs = this.getSpeciesArgs(),
            networkArgs = this.getNetworkArgs(),
            def = $q.defer();
        if(speciesArgs.length) {
            speciesArgs.forEach(function(arg) {
                list.push(arg.arg);
            });
            def.resolve(list);
        } else if (networkArgs.length) {
            var params = {},
                idx = 0;
            networkArgs.forEach(function(n){
                params['network_id['+(idx++)+']'] = n.getId();
            });
            var cacheKey = CacheService.keyFromObject(params);
            list = CacheService.get(cacheKey);
            if(list && list.length) {
                def.resolve(list);
            } else {
                $http.get('/npn_portal/species/getSpeciesFilter.json',{params: params})
                     .success(function(species){
                        CacheService.put(cacheKey,species);
                        def.resolve(species);
                     });
                 }
        } else {
            def.resolve(list);
        }
        return def.promise;
    };
    /**
     * Fetches a list of phenophase objects that correspond to this filter.  If the filter has
     * species args in it then the sid must match one of the filter's species otherwise it's assumed
     * that there are network args in the filter and the phenophases are chased.
     *
     * @param  {Number} sid The species id
     * @return {Promise}    A promise that will be resolved with the list.
     */
    NpnFilter.prototype.getPhenophasesForSpecies = function(sid) {
        var speciesArgs = this.getSpeciesArgs(),
            def = $q.defer(),i;
        if(typeof(sid) === 'string') {
            sid = parseInt(sid);
        }
        if(speciesArgs.length) {
            var found = false;
            for(i = 0; i < speciesArgs.length; i++) {
                if(speciesArgs[i].getId() === sid) {
                    def.resolve(speciesArgs[i].getPhenophaseList());
                    found = true;
                    break;
                }
            }
            if(!found) {
                def.resolve([]);
            }
        } else {
            var params = { return_all: true, species_id: sid },
                cacheKey = CacheService.keyFromObject(params),
                list = CacheService.get(cacheKey);
            if(list && list.length) {
                def.resolve(list);
            } else {
                // not part of the filter go get it
                // this is a bit of cut/paste from SpeciesFilterArg could maybe be consolidated?
                $http.get('/npn_portal/phenophases/getPhenophasesForSpecies.json',{
                    params: params
                }).success(function(phases) {
                    var seen = {},
                        filtered = phases[0].phenophases.filter(function(pp){ // the call returns redundant data so filter it out.
                        if(seen[pp.phenophase_id]) {
                            return false;
                        }
                        seen[pp.phenophase_id] = pp;
                        return true;
                    });
                    CacheService.put(cacheKey,filtered);
                    def.resolve(filtered);
                });
            }
        }
        return def.promise;
    };
    return NpnFilter;
}])
/**
 * TODO - need to nail down the event model and probably even formalize it via a service because it's all
 * pretty loosey goosey at the moment.  Bad enough duplicating strings around...
 */
.factory('FilterService',['$q','$http','$rootScope','$timeout','$log','$filter','uiGmapGoogleMapApi','md5','NpnFilter','SpeciesFilterArg','SettingsService',
    function($q,$http,$rootScope,$timeout,$log,$filter,uiGmapGoogleMapApi,md5,NpnFilter,SpeciesFilterArg,SettingsService){
    // NOTE: this scale is limited to 20 colors
    var colors = [
          '#1f77b4','#ff7f0e','#2ca02c','#d62728','#222299', '#c51b8a',  '#8c564b', '#637939', '#843c39',
          '#5254a3','#636363',
          '#bcbd22', '#7b4173','#e7ba52', '#222299',  '#f03b20', '#1b9e77','#e377c2',  '#ef8a62', '#91cf60', '#9467bd'
        ],
        color_domain = d3.range(0,colors.length),
        colorScale = d3.scale.ordinal().domain(color_domain).range(color_domain.map(function(i){
          return d3.rgb(colors[i]).darker(1.0).toString();
        })),
        choroplethScales = color_domain.map(function(i) {
            var maxColor = colorScale(i),
                minColor = d3.rgb(maxColor).brighter(4.0).toString();
            return d3.scale.linear().range([minColor,maxColor]);
        }),
        filter = new NpnFilter(),
        filterUpdateCount,
        paused = false,
        defaultIcon = {
            //path: google.maps.SymbolPath.CIRCLE,
            //'M 125,5 155,90 245,90 175,145 200,230 125,180 50,230 75,145 5,90 95,90 z',
            fillColor: '#00ff00',
            fillOpacity: 1.0,
            scale: 8,
            strokeColor: '#204d74',
            strokeWeight: 1
        },
        last,
        lastFiltered = [];
    // now that the boundaries of the choropleth scales have been built
    // reset the color scale to use the median color rather than the darkest
    /*
    choroplethScales.forEach(function(s){
        s.domain([0,20]);
    });
    colorScale = d3.scale.ordinal().domain(color_domain).range(color_domain.map(function(d){
        return choroplethScales[d](11);
    }));*/
    uiGmapGoogleMapApi.then(function(maps) {
        defaultIcon.path = maps.SymbolPath.CIRCLE;
    });
    function getFilterParams() {
        if(filter.hasCriteria()) {
            var params = {},
                date = filter.getDateArg();
            if(date) {
                params['start_date'] = date.getStartDate();
                params['end_date'] = date.getEndDate();
            }
            filter.getSpeciesArgs().forEach(function(arg,i){
                params['species_id['+(i)+']'] = arg.getId();
            });
            filter.getNetworkArgs().forEach(function(arg,i){
                params['network_id['+(i)+']'] = arg.getId();
            });
            return params;
        }
    }
    $rootScope.$on('filter-rerun-phase2',function(event,data){
        if(!paused) {
            $timeout(function(){
                if(last) {
                    var markers = post_filter(last,true);
                    $rootScope.$broadcast('filter-marker-updates',{markers: markers});
                }
            },500);
        }
    });

    var geoResults = {
            previousFilterCount: 0,
            previousFilterMap: {},
            hits: [],
            misses: []
        };
    function geo_filter(markers,refilter) {
        function _mapdiff(a,b) { // a should have one more key than b, what is that key's value?
            var aKeys = Object.keys(a),
                bKeys = Object.keys(b),
                i;
            if(aKeys.length !== (bKeys.length+1)) {
                $log.warn('Issue with usage of _mapdiff, unexpected key lengths',a,b);
            }
            if(aKeys.length === 1) {
                return a[aKeys[0]];
            }
            for(i = 0; i < aKeys.length; i++) {
                if(!b[aKeys[i]]) {
                    return a[aKeys[i]];
                }
            }
            $log.warn('Issue with usage of _mapdiff, unfound diff',a,b);
        }
        function _filtermap() {
            var map = {};
            angular.forEach(filter.getGeographicArgs(),function(arg){
                map[arg.getUid()] = arg;
            });
            return map;
        }
        function _runfilter(toFilter,filterFunc) {
            var results = {
                hits: [],
                misses: []
            };
            angular.forEach(toFilter,function(m){
                if(filterFunc(m)) {
                    results.hits.push(m);
                } else {
                    results.misses.push(m);
                }
            });
            return results;
        }
        var start = Date.now(),
            filters = filter.getGeographicArgs(),
            geoCount = filters.length,
            geoAdd = geoCount > geoResults.previousFilterCount,
            newMap = _filtermap(),
            filtered;
        if(geoCount > 0 && geoResults.previousFilterCount === geoCount) {
            if(angular.equals(Object.keys(newMap),Object.keys(geoResults.previousFilterMap))) {
                $log.debug('refilter but no change in geographic filters');
                return geoResults.hits;
            }
            $log.warn('refilter but no change in geo filter count');
        }
        geoResults.previousFilterCount = geoCount;
        if(geoCount === 0) {
            geoResults.misses = [];
            geoResults.hits = [].concat(markers);
        } else if(!refilter || Object.keys(newMap).length === 1) {
            // this is a new filter execution need to apply the filter to all markers
            // this use case may perform poorly in some cases like
            // FireFox >2 geo filters and a lot of markers
            // includes special case of first added geo filter
            filtered = _runfilter(markers,function(m){
                var hit = false,i;
                for(i = 0; i < filters.length; i++){
                    if((hit=filters[i].$filter(m))) {
                        break;
                    }
                }
                return hit;
            });
            geoResults.hits = filtered.hits;
            geoResults.misses = filtered.misses;
        } else if (geoAdd) {
            var addedFilter = _mapdiff(newMap,geoResults.previousFilterMap);
            // applying new filter against what was missed last time around
            filtered = _runfilter(geoResults.misses,function(m){
                return addedFilter.$filter(m);
            });
            geoResults.hits = geoResults.hits.concat(filtered.hits);
            geoResults.misses = filtered.misses;
        } else {
            var removedFilter = _mapdiff(geoResults.previousFilterMap,newMap);
            // test filter being removed against previous hits to see which should be removed
            filtered = _runfilter(geoResults.hits,function(m){
                return removedFilter.$filter(m);
            });
            geoResults.hits = filtered.misses;
            geoResults.misses = geoResults.misses.concat(filtered.hits);
        }
        geoResults.previousFilterMap = newMap;
        $log.debug('geo time:'+(Date.now()-start));
        //$log.debug('geoResults',geoResults);
        return geoResults.hits;
    }
    function post_filter(markers,refilter) {
        var start = Date.now();
        $rootScope.$broadcast('filter-phase2-start',{
            count: markers.length
        });
        var observationCount = 0,
            hasSpeciesArgs = filter.getSpeciesArgs().length > 0,
            networkArgs = filter.getNetworkArgs(),
            speciesTitle = $filter('speciesTitle'),
            speciesTitleFormat = SettingsService.getSettingValue('tagSpeciesTitle'),
            updateNetworkCounts = function(station,species) {
                if(networkArgs.length) {
                    angular.forEach(networkArgs,function(networkArg){
                        networkArg.updateCounts(station,species);
                    });
                }
            },
            filtered =  geo_filter(markers,refilter).filter(function(station){
                station.markerOpts.icon.fillColor = defaultIcon.fillColor;
                var i,sid,speciesFilter,keeps = 0,
                    n,hitMap = {},pid;

                station.observationCount = 0;
                station.speciesInfo = undefined;

                for(sid in station.species) {
                    speciesFilter = filter.getSpeciesArg(sid);
                    hitMap[sid] = 0;
                    if(!speciesFilter && hasSpeciesArgs) {
                        $log.warn('species found in results but not in filter',station.species[sid]);
                        continue;
                    }
                    if(speciesFilter && (n=speciesFilter.$filter(station.species[sid]))) {
                        observationCount += n;
                        station.observationCount += n;
                        hitMap[sid]++;
                        keeps++;
                        updateNetworkCounts(station,station.species[sid]);
                        if(!station.speciesInfo){
                            station.speciesInfo = {
                                titles: {},
                                counts: {}
                            };
                        }
                        station.speciesInfo.titles[sid] = speciesTitle(speciesFilter.arg,speciesTitleFormat);
                        station.speciesInfo.counts[sid] = n;
                    } else if(!speciesFilter) {
                        // if we're here it means we have network filters but not species filters
                        // just update observation counts and hold onto all markers
                        for(pid in station.species[sid]) {
                            station.species[sid][pid].$match = true; // potentially LEAKY but attribute shared by Species/NetworkFilterArg
                            n = SpeciesFilterArg.countObservationsForPhenophase(station.species[sid][pid]);
                            station.observationCount += n;
                            observationCount += n;
                        }
                        keeps++;
                        updateNetworkCounts(station,station.species[sid]);
                    }
                }
                // look through the hitMap and see if there were multiple hits for multiple species
                hitMap['n'] = 0;
                for(sid in hitMap) {
                    if(sid != 'n' && hitMap[sid] > 0) {
                        hitMap['n']++;
                    }
                }
                station.markerOpts.title = station.station_name + ' ('+station.observationCount+')';
                if(station.speciesInfo) {
                    station.markerOpts.title += ' ['+
                        Object.keys(station.speciesInfo.titles).map(function(sid){
                            return station.speciesInfo.titles[sid];
                        }).join(',')+']';
                }
                station.markerOpts.icon.strokeColor = (hitMap['n'] > 1) ? '#00ff00' : defaultIcon.strokeColor;
                station.markerOpts.zIndex = station.observationCount + 2; // layers are on 0 and bounds 1 so make sure a marker's zIndex is at least 3
                return keeps > 0;
            }).map(function(m){
                // simplify the contents of the filtered marker results o/w there's a ton of data that
                // angular copies on a watch which slows things WAY down for some browsers in particular (FireFox ahem)
                return {
                    latitude: m.latitude,
                    longitude: m.longitude,
                    markerOpts: m.markerOpts,
                    station_id: m.station_id,
                    station_name: m.station_name,
                    observationCount: m.observationCount,
                    speciesInfo: m.speciesInfo
                };
            });
        if(hasSpeciesArgs) {
            // for all markers pick the species with the highest observation density as its color
            // on this pass build spRanges which will contain the min/max count for every species
            // for use the next pass.
            var spRanges = {};
            filtered.forEach(function(m){
                var sids = Object.keys(m.speciesInfo.counts),
                    maxSid = sids.reduce(function(p,c){
                            if(!spRanges[c]) {
                                spRanges[c] = {
                                    min: m.speciesInfo.counts[c],
                                    max: m.speciesInfo.counts[c]
                                };
                            } else {
                                if(m.speciesInfo.counts[c] < spRanges[c].min) {
                                    spRanges[c].min = m.speciesInfo.counts[c];
                                }
                                if(m.speciesInfo.counts[c] > spRanges[c].max) {
                                    spRanges[c].max = m.speciesInfo.counts[c];
                                }
                            }
                            return (m.speciesInfo.counts[c] > m.speciesInfo.counts[p]) ? c : p;
                        },sids[0]),
                    arg = filter.getSpeciesArg(maxSid);
                m.markerOpts.icon.fillColorIdx = arg.colorIdx;
            });
            // sort markers into buckets based on color and then choropleth colors based on observationCount
            filter.getSpeciesArgs().forEach(function(arg) {
                if(!spRanges[arg.arg.species_id]) {
                    return; // no markers of this type?
                }
                var argMarkers = filtered.filter(function(m) {
                        return arg.colorIdx === m.markerOpts.icon.fillColorIdx;
                    }),
                    sid = arg.arg.species_id,
                    minCount = spRanges[sid].min,
                    maxCount = spRanges[sid].max;
                $log.debug('observationCount variability for '+arg.toString()+ ' ('+arg.arg.common_name+') ['+ minCount + '-' + maxCount + ']');
                var choroplethScale = choroplethScales[arg.colorIdx];
                choroplethScale.domain([minCount,maxCount]);
                argMarkers.forEach(function(marker){
                    marker.markerOpts.icon.fillColor = choroplethScale(marker.speciesInfo.counts[sid]);
                });
            });
        } else {
            // network only filter, choropleth markers based on overall observation counts
            var minCount = d3.min(filtered,function(d) { return d.observationCount; }),
                maxCount = d3.max(filtered,function(d) { return d.observationCount; });
            $log.debug('observationCount variability for network only results ['+ minCount + '-' + maxCount + ']');
            choroplethScales[0].domain([minCount,maxCount]);
            filtered.forEach(function(marker){
                marker.markerOpts.icon.fillColorIdx = 0;
                marker.markerOpts.icon.fillColor = choroplethScales[0](marker.observationCount);
            });
        }
        // build $markerKey based on marker contents -last- so the key encompasses all marker content.
        filtered.forEach(function(m){
            // use a hash for the markerKey so that only when things have changed is the marker
            // updated by the map for performance.  turns out that using things like colors was insufficient
            // in cases where the counts changed but choropleth colors amazingly stayed the same (relative counts)
            // would result in bad behavior.
            m.$markerKey = md5.createHash(JSON.stringify(m));
        });
        $rootScope.$broadcast('filter-phase2-end',{
            station: filtered.length,
            observation: observationCount
        });
        $log.debug('phase2 time:',(Date.now()-start));
        return (lastFiltered = filtered);
    }
    function execute() {
        var def = $q.defer(),
            filterParams = getFilterParams();
        if(!paused && filterParams && filterUpdateCount != filter.getUpdateCount()) {
            filterUpdateCount = filter.getUpdateCount();
            var start = Date.now();
            $log.debug('execute',filterUpdateCount,filterParams);
            $rootScope.$broadcast('filter-phase1-start',{});
            $http.get('/npn_portal/observations/getAllObservationsForSpecies.json',{
                params: filterParams
            }).success(function(d) {
                angular.forEach(d.station_list,function(station){
                    station.markerOpts = {
                        title: station.station_name,
                        icon: angular.extend({},defaultIcon)
                    };
                });
                $rootScope.$broadcast('filter-phase1-end',{
                    count: d.station_list.length
                });
                // now need to walk through the station_list and post-filter by phenophases...
                $log.debug('phase1 time:',(Date.now()-start));
                //$log.debug('results-pre',d);
                def.resolve(post_filter(last=d.station_list));
            });
        } else {
            // either no filter or a request to re-execute a filter that hasn't changed...
            def.resolve(lastFiltered);
        }
        return def.promise;
    }
    function broadcastFilterUpdate() {
        if(!paused) {
            $rootScope.$broadcast('filter-update',{});
        }
    }
    function broadcastFilterReset() {
        lastFiltered = [];
        $rootScope.$broadcast('filter-reset',{});
    }
    function updateColors() {
        filter.getSpeciesArgs().forEach(function(arg,i){
            arg.colorIdx = i;
            arg.color = colorScale(i);
        });
    }
    return {
        execute: execute,
        getFilteredMarkers: function() {
            return lastFiltered;
        },
        pause: function() {
            $log.debug('PAUSE');
            paused = true;
        },
        resume: function() {
            $log.debug('RESUME');
            paused = false;
            broadcastFilterUpdate();
        },
        getFilter: function() {
            return filter;
        },
        hasFilterChanged: function() {
            return filterUpdateCount !== filter.getUpdateCount();
        },
        isFilterEmpty: function() {
            return !filter.hasCriteria();
        },
        hasDate: function() {
            return filter.hasDate();
        },
        hasSufficientCriteria: function() {
            return filter.hasSufficientCriteria();
        },
        addToFilter: function(item) {
            if(filter.add(item)) {
                updateColors();
                broadcastFilterUpdate();
            }
        },
        removeFromFilter: function(item) {
            if(filter.remove(item)) {
                if(filter.hasCriteria()) {
                    broadcastFilterUpdate();
                } else {
                    broadcastFilterReset();
                }
            }
        },
        resetFilter: function() {
            filter.reset();
            filterUpdateCount = filter.getUpdateCount();
            broadcastFilterReset();
        },
        getColorScale: function() {
            return colorScale;
        },
        getChoroplethScale: function(sid) {
            var arg = filter.getSpeciesArg(sid);
            if(arg) {
                return choroplethScales[arg.colorIdx];
            }
        },
        getChoroplethScales: function() {
            return choroplethScales;
        }
    };
}])
.directive('npnFilterResults',['$rootScope','$http','$timeout','$filter','$log','FilterService','SettingsService','StationService','ClusterService',
    function($rootScope,$http,$timeout,$filter,$log,FilterService,SettingsService,StationService,ClusterService){
    return {
        restrict: 'E',
        template: '<ui-gmap-markers models="results.markers" idKey="\'$markerKey\'" coords="\'self\'" icon="\'icon\'" options="\'markerOpts\'" doCluster="doCluster" clusterOptions="clusterOptions" control="mapControl" events="markerEvents"></ui-gmap-markers>',
        scope: {
        },
        controller: function($scope) {
            var filter_control_open = false;
            $scope.results = {
                markers: []
            };
            $scope.mapControl = {};
            $scope.doCluster = SettingsService.getSettingValue('clusterMarkers');
            var clusterOptions = ClusterService.getDefaultClusterOptions(),
                badgeFormatter = $filter('speciesBadge');
            $scope.clusterOptions = angular.extend(clusterOptions,{
                calculator: function(markers,styleCount) {
                    var oCount = 0,
                        fmt = SettingsService.getSettingValue('tagBadgeFormat'),r = {index:1};
                    markers.values().forEach(function(marker) {
                        oCount += marker.model.observationCount;
                    });
                    r.text = badgeFormatter({station: markers.length,observation: oCount},SettingsService.getSettingValue('tagBadgeFormat'));
                    for(var i = 0; i <clusterOptions.styles.length;i++) {
                        if(oCount >= clusterOptions.styles[i].n) {
                            r.index = (i+1);
                        }
                    }
                    return r;
                }
            });
            $scope.$on('setting-update-tagBadgeFormat',function(event,data){
                if($scope.mapControl && $scope.mapControl.managerDraw) {
                    $scope.mapControl.managerDraw();
                }
            });
            $scope.$on('setting-update-clusterMarkers',function(event,data){
                $scope.doCluster = data.value;
            });
            function updateMarkers(markers) {
                var totalOcount = markers.reduce(function(n,c) { return n+c.observationCount; },0),
                    n = (totalOcount > 512 ? Math.round(totalOcount/2) : 512),i;
                for(i = clusterOptions.styles.length-1; i >= 0; i--) {
                    clusterOptions.styles[i].n = n;
                    n = Math.round(n/2);
                }
                $scope.results.markers = markers;
            }
            function executeFilter() {
                if(FilterService.hasFilterChanged() && FilterService.hasSufficientCriteria()) {
                    $timeout(function(){
                        $scope.results.markers = [];
                        $timeout(function(){
                            FilterService.execute().then(function(markers) {
                                updateMarkers(markers);
                            });
                        },500);
                    },500);
                }
            }
            $scope.$on('tool-open',function(event,data){
                filter_control_open = (data.tool.id === 'filter');
            });
            $scope.$on('tool-close',function(event,data) {
                if(data.tool.id === 'filter') {
                    filter_control_open = false;
                    executeFilter();
                }
            });
            $scope.$on('filter-update',function(event,data){
                if(!filter_control_open) {
                    executeFilter();
                }
            });
            $scope.$on('filter-reset',function(event,data){
                $scope.results.markers = [];
            });
            $scope.$on('filter-marker-updates',function(event,data){
                updateMarkers(data.markers);
            });
            var markerEvents = StationService.getMarkerEvents();
            $scope.markerEvents = {
                'click' : markerEvents.click,
                'mouseover' : function(m){
                    $rootScope.$broadcast('marker-mouseover',{ marker: m });
                },
                'mouseout' : function(m){
                    $rootScope.$broadcast('marker-mouseout',{ marker: m });
                }
            };
        }
    };
}])
.directive('choroplethInfo',['$log','$timeout','FilterService',function($log,$timeout,FilterService){
    return {
        restrict: 'E',
        templateUrl: 'js/filter/choroplethInfo.html',
        controller: function($scope) {
            var mouseIn = false;
            $scope.show = false;
            function buildColors(val) {
                // TODO BUG here when max of the domain gets too small..
                var range = Math.ceil(val.domain[1]/20),i,n,colors = [];
                for(i = 0;i < 20; i++) {
                    n = (range*i)+1;
                    colors[i] = val.scale(n);
                    if(val.count >= n) {
                       val.color = colors[i]; // this isn't exact but pick the "closest" color
                    }
                }
                colors.forEach(function(c){
                    if(val.colors.indexOf(c) === -1) {
                        val.colors.push(c);
                    }
                });
                return val;
            }
            $scope.$on('marker-mouseover',function(event,data){
                $log.debug('mouseover',data);
                if(data.marker.model.speciesInfo || data.marker.model.observationCount) {
                    mouseIn = true;
                    $timeout(function(){
                        if($scope.show = mouseIn) {
                            $scope.station_name = data.marker.model.station_name;
                            var scales = FilterService.getChoroplethScales();
                            if(data.marker.model.speciesInfo) {
                                var sids = Object.keys(data.marker.model.speciesInfo.counts);

                                $scope.data = sids.map(function(sid){
                                    var arg = FilterService.getFilter().getSpeciesArg(sid),
                                        val = {
                                            sid: sid,
                                            count: data.marker.model.speciesInfo.counts[sid],
                                            title: data.marker.model.speciesInfo.titles[sid],
                                            arg: arg,
                                            scale: scales[arg.colorIdx],
                                            domain: scales[arg.colorIdx].domain(),
                                            colors: []
                                        };
                                    return buildColors(val);
                                });
                            } else if (data.marker.model.observationCount) {
                                var v = {
                                    count: data.marker.model.observationCount,
                                    title: 'All Records',
                                    scale: scales[0],
                                    domain: scales[0].domain(),
                                    colors: []
                                };
                                $scope.data = [buildColors(v)];
                            }
                            $log.debug($scope.data);
                        }
                    },500);
                }
            });
            $scope.$on('marker-mouseout',function(event,data){
                $log.debug('mouseout',data);
                mouseIn = false;
                if($scope.show) {
                    $timeout(function(){
                        if(!mouseIn){
                            $scope.show = false;
                            $scope.data = undefined;
                        }
                    },500);

                }
            });
        }
    };
}])
.directive('filterTags',['FilterService',function(FilterService){
    return {
        restrict: 'E',
        templateUrl: 'js/filter/filterTags.html',
        scope: {
        },
        controller: function($scope){
            $scope.getFilter = FilterService.getFilter;
        }
    };
}])
.filter('speciesBadge',function(){
    return function(counts,format){
        if(format === 'observation-count') {
            return counts.observation;
        }
        if(format === 'station-count') {
            return counts.station;
        }
        if(format === 'station-observation-count') {
            return counts.station+'/'+counts.observation;
        }
        return counts;
    };
})
.filter('speciesTitle',['SettingsService',function(SettingsService){
    return function(item,format) {
        var fmt = format||SettingsService.getSettingValue('tagSpeciesTitle');
        if(fmt === 'common-name') {
            if(item.common_name) {
                var lower = item.common_name.toLowerCase();
                return lower.substring(0,1).toUpperCase()+lower.substring(1);
            }
            return item.common_name;
        } else if (fmt === 'scientific-name') {
            return item.genus+' '+item.species;
        }
        return item;
    };
}])
.directive('speciesFilterTag',['$rootScope','FilterService','SettingsService','SpeciesFilterArg',function($rootScope,FilterService,SettingsService,SpeciesFilterArg){
    return {
        restrict: 'E',
        require: '^filterTags',
        templateUrl: 'js/filter/speciesFilterTag.html',
        scope: {
            arg: '='
        },
        controller: function($scope){
            $scope.titleFormat = SettingsService.getSettingValue('tagSpeciesTitle');
            $scope.$on('setting-update-tagSpeciesTitle',function(event,data){
                $scope.titleFormat = data.value;
            });
            $scope.badgeFormat = SettingsService.getSettingValue('tagBadgeFormat');
            $scope.badgeTooltip = SettingsService.getSettingValueLabel('tagBadgeFormat');
            $scope.$on('setting-update-tagBadgeFormat',function(event,data){
                $scope.badgeFormat = data.value;
                $scope.badgeTooltip = SettingsService.getSettingValueLabel('tagBadgeFormat');
            });
            $scope.$on('filter-phase2-start',function(event,data) {
                $scope.arg.resetCounts(0);
            });
            $scope.$on('filter-phase1-start',function(event,data) {
                $scope.arg.resetCounts('?');
            });
            $scope.removeFromFilter = FilterService.removeFromFilter;
            $scope.status = {
                isopen: false
            };
            $scope.hasCount = function(v,i) {
                return v.count > 0;
            };
            // TODO - leaky
            // keep track of selected phenophases during open/close of the list
            // if on close something changed ask that the currently filtered data
            // be re-filtered.
            var saved_pheno_state;
            $scope.$watch('status.isopen',function() {
                if($scope.status.isopen) {
                    saved_pheno_state = $scope.arg.phenophases.map(function(pp) { return pp.selected; });
                } else if (saved_pheno_state) {
                    for(var i = 0; i < saved_pheno_state.length; i++) {
                        if(saved_pheno_state[i] != $scope.arg.phenophases[i].selected) {
                            $rootScope.$broadcast('filter-rerun-phase2',{});
                            break;
                        }
                    }
                }
            });
            $scope.selectAll = function(state) {
                angular.forEach($scope.arg.phenophases,function(pp){
                    pp.selected = state;
                });
            };
        }
    };
}])
.directive('dateFilterTag',['FilterService','SettingsService',function(FilterService,SettingsService){
    return {
        restrict: 'E',
        require: '^filterTags',
        templateUrl: 'js/filter/dateFilterTag.html',
        scope: {
            arg: '='
        },
        controller: function($scope){
            $scope.badgeFormat = SettingsService.getSettingValue('tagBadgeFormat');
            $scope.badgeTooltip = SettingsService.getSettingValueLabel('tagBadgeFormat');
            $scope.$on('setting-update-tagBadgeFormat',function(event,data){
                $scope.badgeFormat = data.value;
                $scope.badgeTooltip = SettingsService.getSettingValueLabel('tagBadgeFormat');
            });
            $scope.removeFromFilter = FilterService.removeFromFilter;
            $scope.counts = {
                station: '?',
                observation: '?'
            };
            $scope.$on('filter-phase1-start',function(event,data) {
                $scope.counts.station = $scope.counts.observation = '?';
            });
            $scope.$on('filter-phase2-start',function(event,data) {
                $scope.counts.station = $scope.counts.observation = 0;
            });
            $scope.$on('filter-phase2-end',function(event,data) {
                $scope.counts = data;
            });
        }
    };
}])
.directive('networkFilterTag',['FilterService','SettingsService',function(FilterService,SettingsService){
    return {
        restrict: 'E',
        require: '^filterTags',
        templateUrl: 'js/filter/networkFilterTag.html',
        scope: {
            arg: '='
        },
        controller: function($scope){
            $scope.badgeFormat = SettingsService.getSettingValue('tagBadgeFormat');
            $scope.badgeTooltip = SettingsService.getSettingValueLabel('tagBadgeFormat');
            $scope.$on('setting-update-tagBadgeFormat',function(event,data){
                $scope.badgeFormat = data.value;
                $scope.badgeTooltip = SettingsService.getSettingValueLabel('tagBadgeFormat');
            });
            $scope.removeFromFilter = FilterService.removeFromFilter;
            $scope.$on('filter-phase1-start',function(event,data) {
                $scope.arg.resetCounts('?');
            });
            $scope.$on('filter-phase2-start',function(event,data) {
                $scope.arg.resetCounts(0);
            });
        }
    };
}])
.directive('filterControl',['$http','$filter','$timeout','FilterService','DateFilterArg','SpeciesFilterArg','NetworkFilterArg','HelpService',
    function($http,$filter,$timeout,FilterService,DateFilterArg,SpeciesFilterArg,NetworkFilterArg,HelpService){
    return {
        restrict: 'E',
        templateUrl: 'js/filter/filterControl.html',
        controller: ['$scope',function($scope) {
            $scope.addDateRangeToFilter = function() {
                FilterService.addToFilter(new DateFilterArg($scope.selected.date));
            };

            $scope.filterHasDate = FilterService.hasDate;
            $scope.filterHasSufficientCriteria = FilterService.hasSufficientCriteria;

            var thisYear = (new Date()).getYear()+1900,
                validYears = d3.range(1900,thisYear+1);
            $scope.thisYear = thisYear;
            $scope.validYears = validYears;

            $scope.selected = {
                date: {
                    start_date: (thisYear-1),
                    end_date: thisYear
                },
                species: []
            };
            $scope.speciesInput = {
                animals: [],
                plants: [],
                networks: []
            };
            $scope.findSpeciesParamsEmpty = true;

            $scope.$watch('selected.species.length',function(length){
                if(length) {
                    HelpService.lookAtMe('#add-species-button');
                }
            });
            $scope.$watch('speciesInput.networks.length',function(length){
                if(length) {
                    HelpService.lookAtMe('#add-networks-button');
                }
            });

            $scope.networksMaxedOut = function() {
                return FilterService.getFilter().getNetworkArgs().length >= 10;
            };
            $scope.speciesMaxedOut = function() {
                return FilterService.getFilter().getSpeciesArgs().length >= 20;
            };
            $scope.addNetworksToFilter = function() {
                HelpService.stopLookingAtMe('#add-networks-button');
                angular.forEach($scope.speciesInput.networks,function(network){
                    if(!$scope.networksMaxedOut()) {
                        FilterService.addToFilter(new NetworkFilterArg(network));
                    }
                });
            };
            $scope.addSpeciesToFilter = function() {
                HelpService.stopLookingAtMe('#add-species-button');
                angular.forEach($scope.selected.species,function(species){
                    if(!$scope.speciesMaxedOut()) {
                        FilterService.addToFilter(new SpeciesFilterArg(species));
                    }
                });
            };

            var findSpeciesParams,
                findSpeciesPromise,
                allSpecies,
                filterInvalidated = true;

            function invalidateResults() {
                var params = {},
                    idx = 0;
                angular.forEach([].concat($scope.speciesInput.animals).concat($scope.speciesInput.plants),function(s){
                    params['group_ids['+(idx++)+']'] = s['species_type_id'];
                });
                idx = 0;
                angular.forEach($scope.speciesInput.networks,function(n){
                    params['network_id['+(idx++)+']'] = n['network_id'];
                });
                findSpeciesParams = params;
                $scope.findSpeciesParamsEmpty = Object.keys(params).length === 0;
                filterInvalidated = true;
            }

            $scope.$watch('speciesInput.animals',invalidateResults);
            $scope.$watch('speciesInput.plants',invalidateResults);
            $scope.$watch('speciesInput.networks',invalidateResults);

            $scope.findSpecies = function() {
                if(filterInvalidated) {
                    filterInvalidated = false;
                    angular.forEach($scope.selected.species,function(species){
                        species.selected = false;
                    });
                    $scope.selected.species = [];
                    if($scope.findSpeciesParamsEmpty && allSpecies && allSpecies.length) {
                        $scope.speciesList = allSpecies;
                    } else {
                        $scope.findingSpecies = true;
                        $scope.serverResults = $http.get('/npn_portal/species/getSpeciesFilter.json',{
                            params: findSpeciesParams
                        }).then(function(response){
                            var species = [];
                            angular.forEach(response.data,function(s){
                                s.number_observations = parseInt(s.number_observations);
                                s.display = $filter('speciesTitle')(s)+' ('+s.number_observations+')';
                                species.push(s);
                            });
                            var results = ($scope.speciesList = species.sort(function(a,b){
                                if(a.number_observations < b.number_observations) {
                                    return 1;
                                }
                                if(a.number_observations > b.number_observations) {
                                    return -1;
                                }
                                return 0;
                            }));
                            if($scope.findSpeciesParamsEmpty) {
                                allSpecies = results;
                            }
                            // this is a workaround to an issue where ng-class isn't getting kicked
                            // when this flag changes...
                            $timeout(function(){
                                $scope.findingSpecies = false;
                            },250);
                            return results;
                        });
                    }
                }
            };
            // update labels if the setting changes.
            $scope.$on('setting-update-tagSpeciesTitle',function(event,data){
                $timeout(function(){
                    angular.forEach($scope.speciesList,function(s){
                        s.display = $filter('speciesTitle')(s)+' ('+s.number_observations+')';
                    });
                },250);
            });
            $http.get('/npn_portal/networks/getPartnerNetworks.json?active_only=true').success(function(partners){
                angular.forEach(partners,function(p) {
                    p.network_name = p.network_name.trim();
                });
                $scope.partners = partners;
            });
            // not selecting all by default to force the user to pick which should result
            // in less expensive type-ahead queries later (e.g. 4s vs 60s).
            $http.get('/npn_portal/species/getPlantTypes.json').success(function(types){
                $scope.plantTypes = types;
            });
            $http.get('/npn_portal/species/getAnimalTypes.json').success(function(types){
                $scope.animalTypes = types;
            });
            // load up "all" species...
            $scope.findSpecies();
        }]
    };
}]);
angular.module('npn-viz-tool.filters',[
])
.filter('cssClassify',function(){
    return function(input) {
        if(typeof(input) === 'string') {
            return input.trim().toLowerCase().replace(/\s+/g,'-');
        }
        return input;
    };
})
.filter('yesNo',function(){
    return function(input) {
        return input ? 'Yes' : 'No';
    };
})
.filter('gte',function(){
    return function(input,num) {
        if(!num || !angular.isArray(input)) {
            return input;
        }
        return input.filter(function(i){
            return i >= num;
        });
    };
})
.filter('lte',function(){
    return function(input,num) {
        if(!num || !angular.isArray(input)) {
            return input;
        }
        return input.filter(function(i){
            return i <= num;
        });
    };
})
.filter('trim',function(){
    return function(input) {
        if(angular.isString(input)) {
            return input.trim();
        }
        return input;
    };
})
.filter('ellipses',function(){
    return function(input) {
        var maxLen = arguments.length == 2 ? arguments[1] : 55;
        if(typeof(input) == 'string' && input.length > maxLen) {
            return input.substring(0,maxLen)+' ...';
        }
        return input;
    };
});
angular.module('npn-viz-tool.help',[
])
.factory('HelpService',['$timeout',function($timeout){
    var LOOK_AT_ME_CLASS = 'look-at-me',
        LOOK_AT_ME_REMOVE_DELAY = 65000, // how long to leave the class in place, should exeed duration*iteration on the CSS animation
        current,
        service = {
        lookAtMe: function(selector,delay) {
            if(current) {
                service.stopLookingAtMe(current);
            }
            // if the class is there then don't add it again there's a timer set to remove it
            if(!$(selector).hasClass(LOOK_AT_ME_CLASS)) {
                $timeout(function(){
                    $(selector).addClass(LOOK_AT_ME_CLASS);
                    current = selector;
                    $timeout(function(){
                        service.stopLookingAtMe(selector);
                    },LOOK_AT_ME_REMOVE_DELAY);
                },(delay||0));
            }
        },
        stopLookingAtMe: function(selector) {
            $(selector).removeClass(LOOK_AT_ME_CLASS);
            current = null;
        }
    };
    return service;
}]);
angular.module('npn-viz-tool.layers',[
'npn-viz-tool.filter',
'ngResource'
])
.factory('LayerService',['$rootScope','$http','$q','$log','uiGmapIsReady',function($rootScope,$http,$q,$log,uiGmapIsReady){
    var layers = null,
        map = null,
        readyPromise = uiGmapIsReady.promise(1).then(function(instances){
            map = instances[0].map;
            $log.debug('LayerService - map is ready');
            return $http.get('layers/layers.json').success(function(data) {
                layers = {};
                data.forEach(function(layer,idx){
                    layer.index = idx;
                    layers[layer.id] = layer;
                });
                $log.debug('LayerService - layer list is loaded', layers);
            });
        }),
        baseStyle = {
            strokeColor: '#666',
            strokeOpacity: null,
            strokeWeight: 1,
            fillColor: '#c0c5b8',
            fillOpacity: null,
            zIndex: 0
        };
    function calculateCenter(feature) {
        if(!feature.properties.CENTER) {
            // [0], per GeoJson spec first array in Polygon coordinates is
            // external ring, other indices are internal rings or "holes"
            var geo = feature.geometry,
                coordinates = geo.type === 'Polygon' ?
                    geo.coordinates[0] :
                    geo.coordinates.reduce(function(p,c){
                        return p.concat(c[0]);
                    },[]),
                i,coord,
                mxLat,mnLat,mxLon,mnLon;
            for(i = 0; i < coordinates.length; i++) {
                coord = coordinates[i];
                if(i === 0) {
                    mxLon = mnLon = coord[0];
                    mxLat = mnLat = coord[1];
                } else {
                    mxLon = Math.max(mxLon,coord[0]);
                    mnLon = Math.min(mnLon,coord[0]);
                    mxLat = Math.max(mxLat,coord[1]);
                    mnLat = Math.min(mnLat,coord[1]);
                }
            }
            feature.properties.CENTER = {
                latitude: (mnLat+((mxLat-mnLat)/2)),
                longitude: (mnLon+((mxLon-mnLon)/2))
            };
        }
    }
    function addMissingFeatureNames(f,i){
        if(!f.properties) {
            f.properties = {};
        }
        if(!f.properties.NAME) {
            f.properties.NAME = ''+i;
        }
    }
    function loadLayerData(layer) {
        var def = $q.defer();
        if(layer.data) {
            def.resolve(layer);
        } else {
            $rootScope.$broadcast('layer-load-start',{});
            $http.get('layers/'+layer.file).success(function(data){
                if(data.type === 'GeometryCollection') {
                    $log.debug('Translating GeometryCollection to FeatureCollection');
                    // translate to FeatureCollection
                    data.features = [];
                    angular.forEach(data.geometries,function(geo,idx){
                        data.features.push({
                            type: 'Feature',
                            properties: { NAME: ''+idx },
                            geometry: geo
                        });
                    });
                    data.type = 'FeatureCollection';
                    delete data.geometries;
                } else if (data.type === 'Topology') {
                    $log.debug('Translating Topojson to GeoJson');
                    data = topojson.feature(data,data.objects[Object.keys(data.objects)[0]]);
                }
                // make sure all features have a name
                data.features.forEach(addMissingFeatureNames);
                // calculate centers
                data.features.forEach(calculateCenter);
                layer.data = data;
                def.resolve(layer);
                $rootScope.$broadcast('layer-load-end',{});
            });
        }
        return def.promise;
    }
    function restyleSync() {
        map.data.setStyle(function(feature){
            var overrides = feature.getProperty('$style');
            if(overrides && typeof(overrides) === 'function') {
                return overrides(feature);
            }
            return overrides ?
                    angular.extend(baseStyle,overrides) : baseStyle;
        });
    }

    function unloadLayer(layer) {
        if(layer.loaded) {
            var unloaded = [];
            for(var i = 0; i < layer.loaded.length; i++) {
                layer.loaded[i].removeProperty('$style');
                map.data.remove(layer.loaded[i]);
                unloaded.push(layer.loaded[i]);
            }
            delete layer.loaded;
            return unloaded;
        }
    }

    return {
        /**
         * @return {Array} A copy of the list of layers as a flat array.
         */
        getAvailableLayers: function() {
            var def = $q.defer();
            readyPromise.then(function(){
                var key,l,arr = [];
                for(key in layers) {
                    l = layers[key];
                    arr.push({
                        id: l.id,
                        index: l.index,
                        label: l.label,
                        source: l.source,
                        img: l.img,
                        link: l.link
                    });
                }
                def.resolve(arr.sort(function(a,b){
                    return a.idx - b.idx;
                }));
            });
            return def.promise;
        },
        /**
         * Forces all features to be restyled.
         *
         * @return {promise} A promise that will be resolved once features have been restyled.
         */
        restyleLayers: function() {
            var def = $q.defer();
            readyPromise.then(function(){
                restyleSync();
                def.resolve();
            });
            return def.promise;
        },
        /**
         * Removes all map layers.
         *
         * @return {promise} A promise that will be resolved when complete.
         */
        resetLayers: function() {
            var def = $q.defer();
            readyPromise.then(function(){
                for(var id in layers) {
                    unloadLayer(layers[id]);
                }
                def.resolve();
            });
            return def.promise;
        },
        /**
         * Loads and adds a layer to the map.
         *
         * @param  {string} id The id of the layer to add.
         * @param  {object|function} style (optional) If an object is a set of style overrides to apply to all added features
         *                           (https://developers.google.com/maps/documentation/javascript/datalayer#style_options).
         *                           If a function is provided then its signature it will be called when styling features so
         *                           that all features can be individually styled as in
         *                           https://developers.google.com/maps/documentation/javascript/datalayer#declarative_style_rules.
         *                           This parameter will be stored and re-used so it can be re-applied during calls to restyleLayers.
         *                           Keep this in mind if you pass a function and your code may go out of scope.
         * @return {promise}       A promise that will be resolved when the layer has been added and its features styled.
         */
        loadLayer: function(id,style) {
            var def = $q.defer();
            readyPromise.then(function(){
                var layer = layers[id];
                if(!layer) {
                    $log.debug('no such layer with id',id);
                    return def.reject(id);
                }
                loadLayerData(layer).then(function(l){
                    layer.style = style;
                    layer.loaded = map.data.addGeoJson(layer.data);
                    layer.loaded.forEach(function(feature){
                        feature.setProperty('$style',style);
                    });
                    restyleSync();
                    def.resolve([map,layer.loaded]);
                });
            });
            return def.promise;
        },
        unloadLayer: function(id) {
            var def = $q.defer();
            readyPromise.then(function(){
                var layer = layers[id];
                if(!layer) {
                    $log.debug('no such layer with id',id);
                    return def.reject(id);
                }
                var unloaded = unloadLayer(layer);
                def.resolve(unloaded);
            });
            return def.promise;
        }
    };
}])
.directive('layerControl',['$rootScope','$q','$location','$log','LayerService','FilterService','GeoFilterArg',function($rootScope,$q,$location,$log,LayerService,FilterService,GeoFilterArg){
    return {
        restrict: 'E',
        templateUrl: 'js/layers/layerControl.html',
        controller: function($scope) {
            $scope.isFilterEmpty = FilterService.isFilterEmpty;
            var eventListeners = [],
                lastFeature;

            function reset() {
                $scope.layerOnMap = {
                    layer: 'none'
                };
            }
            reset();
            $scope.$on('filter-reset',reset);

            LayerService.getAvailableLayers().then(function(layers){
                function broadcastLayersReady() {
                    $rootScope.$broadcast('layers-ready',{});
                }
                $log.debug('av.layers',layers);
                $scope.layers = layers;
                var qargs = $location.search();
                if(qargs['g']) {
                    $log.debug('init layers from query arg',qargs['g']);
                    // only one layer at a time is supported so the "first" id is sufficient.
                    var featureList = qargs['g'].split(';'),
                        featureIds = featureList.map(function(f) {
                            return f.substring(f.indexOf(':')+1);
                        }),
                        layerId = featureList[0].substring(0,featureList[0].indexOf(':')),
                        lyr,i;
                    for(i = 0; i < layers.length; i++) {
                        if(layers[i].id === layerId) {
                            lyr = layers[i];
                            break;
                        }
                    }
                    if(lyr) {
                        loadLayer(lyr).then(function(results) {
                            var map = results[0],
                                features = results[1];
                            $scope.layerOnMap.skipLoad = true;
                            $scope.layerOnMap.layer = lyr; // only update this -after- the fact
                            features.forEach(function(f) {
                                if(featureIds.indexOf(f.getProperty('NAME')) != -1) {
                                    clickFeature(f,map);
                                }
                            });
                            broadcastLayersReady();
                        });
                    }
                } else {
                    broadcastLayersReady();
                }
            });

            function restyleAndRefilter() {
                LayerService.restyleLayers().then(function(){
                    if(FilterService.getFilter().hasSufficientCriteria()) {
                        $rootScope.$broadcast('filter-rerun-phase2',{});
                    }
                });
            }

            function clickFeature(feature,map) {
                var filterArg = feature.getProperty('$FILTER');
                lastFeature = feature;
                if(!filterArg) {
                    filterArg = new GeoFilterArg(feature,$scope.layerOnMap.layer.id);
                    FilterService.addToFilter(filterArg);
                    // TODO - different layers will probably have different styles, duplicating hard coded color...
                    // over-ride so the change shows up immediately and will be applied on the restyle (o/w there's a pause)
                    map.data.overrideStyle(feature, {fillColor: '#800000'});
                    feature.setProperty('$FILTER',filterArg);
                    restyleAndRefilter();
                }
            }

            function rightClickFeature(feature,map) {
                var filterArg = feature.getProperty('$FILTER');
                lastFeature = feature;
                if(filterArg) {
                    FilterService.removeFromFilter(filterArg);
                    feature.setProperty('$FILTER',null);
                    restyleAndRefilter();
                }
            }


            $scope.$watch('layerOnMap.layer',function(newLayer,oldLayer){
                if($scope.layerOnMap.skipLoad) {
                    $scope.layerOnMap.skipLoad = false;
                    return;
                }
                if(oldLayer && oldLayer != 'none') {
                    LayerService.unloadLayer(oldLayer.id).then(function(unloaded){
                        var geoArgs = FilterService.getFilter().getGeoArgs(),
                            filterUpdate = geoArgs.length > 0;
                        geoArgs.forEach(function(filterArg){
                            FilterService.removeFromFilter(filterArg);
                        });
                        unloaded.forEach(function(feature) {
                            feature.setProperty('$FILTER',null);
                        });
                        // TODO - maybe instead the filter should just broadcast the "end" event
                        if(filterUpdate && !FilterService.isFilterEmpty()) {
                            $rootScope.$broadcast('filter-rerun-phase2',{});
                        }
                        loadLayer(newLayer);
                    });
                } else if(newLayer){
                    loadLayer(newLayer);
                }
            });

            function loadLayer(layer) {
                var def = $q.defer();
                if(layer === 'none') {
                    return def.resolve(null);
                }
                LayerService.loadLayer(layer.id,function(feature) {
                    var style = {
                            strokeOpacity: 1,
                            strokeColor: '#666',
                            strokeWeight: 1,
                            fillOpacity: 0
                        };
                    if(feature.getProperty('$FILTER')) {
                        style.fillColor = '#800000';
                        style.fillOpacity = 0.5;
                    }
                    return style;
                })
                .then(function(results){
                    if(!eventListeners.length) {
                        var map = results[0];
                        // this feels kind of like a workaround since the markers aren't
                        // refreshed until the map moves so forcibly moving the map
                        $scope.$on('filter-phase2-end',function(event,data) {
                            if(lastFeature) {
                                var center = lastFeature.getProperty('CENTER');
                                map.panTo(new google.maps.LatLng(center.latitude,center.longitude));
                                lastFeature = null;
                            }
                        });
                        eventListeners.push(map.data.addListener('mouseover',function(event){
                            map.data.overrideStyle(event.feature, {strokeWeight: 3});
                        }));
                        eventListeners.push(map.data.addListener('mouseout',function(event){
                            map.data.revertStyle();
                        }));
                        eventListeners.push(map.data.addListener('click',function(event){
                            $scope.$apply(function(){
                                clickFeature(event.feature,map);
                            });
                        }));
                        eventListeners.push(map.data.addListener('rightclick',function(event){
                            $scope.$apply(function(){
                                rightClickFeature(event.feature,map);
                            });
                        }));
                    }
                    def.resolve(results);
                });
                return def.promise;
            }
            // shouldn't happen
            $scope.$on('$destroy',function(){
                LayerService.resetLayers();
                eventListeners.forEach(function(el){
                    el.remove();
                });
            });
        }
    };
}]);
angular.module('npn-viz-tool',[
'templates-npnvis',
'npn-viz-tool.map',
'uiGmapgoogle-maps',
'ui.bootstrap',
'ngAnimate'
])
.config(['uiGmapGoogleMapApiProvider','$logProvider',function(uiGmapGoogleMapApiProvider,$logProvider) {
    uiGmapGoogleMapApiProvider.configure({
        key: 'AIzaSyAsTM8XaktfkwpjEeDMXkNrojaiB2W5WyE',
        v: '3.24',
        libraries: ['geometry','drawing']
    });
    $logProvider.debugEnabled(window.location.hash && window.location.hash.match(/^#.*#debug/));
    window.onbeforeunload = function() {
        return 'You are about to navigate away from the USA-NPN Visualization Tool.  Are you sure you want to do this?';
    };
}]);
angular.module('npn-viz-tool.map',[
    'npn-viz-tool.layers',
    'npn-viz-tool.stations',
    'npn-viz-tool.toolbar',
    'npn-viz-tool.filter',
    'npn-viz-tool.bounds',
    'npn-viz-tool.settings',
    'npn-viz-tool.vis',
    'npn-viz-tool.share',
    'npn-viz-tool.export',
    'npn-viz-tool.help',
    'uiGmapgoogle-maps'
])
.directive('npnVizMap',['$location','$timeout','uiGmapGoogleMapApi','uiGmapIsReady','RestrictedBoundsService','FilterService','HelpService',
    function($location,$timeout,uiGmapGoogleMapApi,uiGmapIsReady,RestrictedBoundsService,FilterService,HelpService){
    return {
        restrict: 'E',
        templateUrl: 'js/map/map.html',
        scope: {
        },
        controller: ['$scope',function($scope) {
            var dfltCenter = { latitude: 38.8402805, longitude: -97.61142369999999 },
                dfltZoom = 4,
                api,
                map;
            $scope.stationView = false;
            uiGmapGoogleMapApi.then(function(maps) {
                api = maps;
                var boundsRestrictor = RestrictedBoundsService.getRestrictor('base_map',new api.LatLngBounds(
                             new google.maps.LatLng(0.0,-174.0),// SW - out in the pacific SWof HI
                             new google.maps.LatLng(75.0,-43.0) // NE - somewhere in greenland
                        ));
                $scope.map = {
                    center: dfltCenter,
                    zoom: dfltZoom,
                    options: {
                        mapTypeId: maps.MapTypeId.TERRAIN,
                        mapTypeControl: true,
                        mapTypeControlOptions: {
                            //style: maps.MapTypeControlStyle.DROPDOWN_MENU,
                            position: maps.ControlPosition.RIGHT_BOTTOM
                        },
                        streetViewControl: false,
                        panControl: false,
                        zoomControl: true,
                        zoomControlOptions: {
                            style: maps.ZoomControlStyle.SMALL,
                            position: maps.ControlPosition.RIGHT_TOP
                        }
                    },
                    events: {
                        center_changed: boundsRestrictor.center_changed
                    }
                };
                uiGmapIsReady.promise(1).then(function(instances){
                    map = instances[0].map;
                    // this is a little leaky, the map knows which args the "share" control cares about...
                    // date is the minimum requirement for filtering.
                    var qargs = $location.search(),
                        qArgFilter = qargs['d'] && (qargs['s'] || qargs['n']);
                    if(!qArgFilter) {
                        stationViewOn();
                    }
                });
            });

            function stationViewOff() {
                $scope.stationView = false;
            }
            function stationViewOn() {
                if(map) {
                    map.panTo(new google.maps.LatLng(dfltCenter.latitude,dfltCenter.longitude));
                    map.setZoom(4);
                }
                $timeout(function(){
                    $scope.stationView = true;
                },500);
                HelpService.lookAtMe('#toolbar-icon-filter',5000 /* wait 5 seconds */);
            }
            /*
            $scope.$on('tool-open',function(event,data){
                if(data.tool.id === 'layers') {
                    stationViewOff();
                }
            });*/
            $scope.$on('filter-phase1-start',stationViewOff);
            $scope.$on('filter-reset',stationViewOn);
            $scope.reset = function() {
                if(!$scope.stationView) {
                    FilterService.resetFilter();
                } else {
                    $scope.stationView = false;
                    $timeout(stationViewOn,500);
                }
            };
            $scope.$on('filter-phase2-end',function(event,data){
                if(data && data.observation) {
                    HelpService.lookAtMe('#toolbar-icon-visualizations',5000 /* wait 5 seconds */);
                }
            });
        }]
    };
}])
.directive('npnWorking',['uiGmapIsReady',function(uiGmapIsReady){
    return {
        restrict: 'E',
        template: '<div id="npn-working" ng-show="working"><i class="fa fa-circle-o-notch fa-spin fa-5x"></i></div>',
        scope: {
        },
        controller: function($scope) {
            function startWorking() { $scope.working = true; }
            function stopWorking() { $scope.working = false;}
            startWorking();
            uiGmapIsReady.promise(1).then(stopWorking);
            $scope.$on('filter-phase1-start',startWorking);
            $scope.$on('filter-phase2-start',startWorking);
            $scope.$on('filter-rerun-phase2',startWorking);
            $scope.$on('filter-phase2-end',stopWorking);
            $scope.$on('layer-load-start',startWorking);
            $scope.$on('layer-load-end',stopWorking);
        }
    };
}]);
/**
 * @ngdoc overview
 * @name npn-viz-tool.vis-map
 * @description
 *
 * Logic for gridded data map visualization.
 */
angular.module('npn-viz-tool.vis-map',[
    'npn-viz-tool.vis',
    'npn-viz-tool.filter',
    'npn-viz-tool.filters',
    'npn-viz-tool.settings',
    'npn-viz-tool.vis-map-services',
    'ui.bootstrap',
    'angularAwesomeSlider'
])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-opacity-slider
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Dynamically controls the opacity of map tiles.
 *
 * @scope
 * @param {object} layer The currently selected map layer.
 */
.directive('mapVisOpacitySlider',['$log','$timeout','WmsService',function($log,$timeout,WmsService) {
    var SELECTOR = 'img[src*="'+WmsService.baseUrl+'"';
    return {
        restrict: 'E',
        template: '<div ng-if="layer" class="form-group"><label for="mapVisOpacitySlider" style="margin-bottom: 15px;">Opacity</label><input ng-model="selection.opacity" type="text" id="mapVisOpacitySlider" slider options="options" /></div>',
        scope: {
            layer: '='
        },
        link: function($scope) {

            $scope.selection = {
                opacity: 75
            };
            $scope.options = {
                from: 1,
                to: 100,
                step: 1,
                dimension: ' %'
            };
            function updateOpacity() {
                var elms = $(SELECTOR);
                if(elms.length) {
                    elms.css('opacity',($scope.selection.opacity/100.0));
                    $log.debug('updated opacity of '+elms.length+' map tiles to '+$scope.selection.opacity);
                }
                return elms.length;
            }
            var tilesChanged,lastTilesChanged;
            // will repeat opacity settings until the # of tiles changed stabilizes.
            function extentChange() {
                tilesChanged = updateOpacity();
                if(!tilesChanged || tilesChanged !== lastTilesChanged) {
                    lastTilesChanged = tilesChanged;
                    $timeout(extentChange,250);
                }
            }
            $scope.$watch('layer.extent.current',function(extent) {
                if(extent) {
                    extentChange();
                }
            });
            $scope.$watch('selection.opacity',updateOpacity);
            // deal with the same thing when the map zoom changes or the center changes.
            var mapEventListeners = [];
            $scope.$watch('layer',function(layer){
                if(layer && !mapEventListeners.length) { // layers/extents may change but the map does not
                    mapEventListeners.push(layer.getMap().addListener('zoom_changed',function(event){
                        $log.debug('zoom_changed');
                        extentChange();
                    }));
                    mapEventListeners.push(layer.getMap().addListener('center_changed',function(event){
                        $log.debug('center_changed');
                        extentChange();
                    }));
                }
            });
            $scope.$on('$destroy',function(){
                mapEventListeners.forEach(function(el){
                    el.remove();
                });
            });
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-doy-control
 * @module npn-viz-tool.vis-map
 * @description
 *
 * control for day of year extents.
 *
 * @scope
 * @param {object} layer The currently selected map layer.
 */
.directive('mapVisDoyControl',['$log','thirtyYearAvgDayOfYearFilter',function($log,thirtyYearAvgDayOfYearFilter){
    var BASE_YEAR = thirtyYearAvgDayOfYearFilter(1,true).getFullYear(),
        ONE_DAY = (24*60*60*1000),
        MONTHS = d3.range(0,12).map(function(m) { return new Date(BASE_YEAR,m); });
    function getDaysInMonth(date) {
        var month = date.getMonth(),
            tmp;
        if(month === 11) {
            return 31;
        }
        tmp = new Date(date.getTime());
        tmp.setMonth(tmp.getMonth()+1);
        tmp.setTime(tmp.getTime()-ONE_DAY);
        $log.debug('last day of month '+(month+1)+' is '+tmp);
        return tmp.getDate();
    }
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/doy-control.html',
        scope: {
            layer: '='
        },
        link: function($scope) {
            $scope.months = MONTHS;
            var currentDate = thirtyYearAvgDayOfYearFilter($scope.layer.extent.current.value,true);
            $scope.selection = {
                month: MONTHS[currentDate.getMonth()]
            };
            function dateWatch(date) {
                $scope.selection.month.setDate(date);
                // this feels a little hoakey matching on label but...
                var label = thirtyYearAvgDayOfYearFilter($scope.selection.month);
                $log.debug('doy-control:date '+label);
                $scope.layer.extent.current = $scope.layer.extent.values.reduce(function(current,v){
                    return current||(v.label === label ? v : undefined);
                },undefined);
            }
            $scope.$watch('selection.month',function(date) {
                var month = $scope.selection.month;
                $log.debug('doy-control:month '+(month.getMonth()+1));
                $scope.dates = d3.range(1,getDaysInMonth(month)+1);
                if(currentDate) {
                    // init
                    $scope.selection.date = currentDate.getDate();
                    currentDate = undefined;
                } else if($scope.selection.date === 1) {
                    dateWatch(1); // month change without date change, need to force the extent to update.
                } else {
                    $scope.selection.date = 1;
                }
            });
            $scope.$watch('selection.date',dateWatch);
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-year-control
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Control for year extents.
 *
 * @scope
 * @param {object} layer The currently selected map layer.
 */
.directive('mapVisYearControl',['$log',function($log){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/year-control.html',
        scope: {
            layer: '='
        },
        link: function($scope) {
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-date-control
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Control for date extents.
 *
 * @scope
 * @param {object} layer The currently selected map layer.
 */
.directive('mapVisDateControl',['$log','dateFilter',function($log,dateFilter){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/date-control.html',
        scope: {
            layer: '='
        },
        link: function($scope) {
            // TODO - hide the today/clear buttons
            $scope.selection = $scope.layer.extent.current.date;
            $scope.minDate = $scope.layer.extent.values[0].date;
            $scope.maxDate = $scope.layer.extent.values[$scope.layer.extent.values.length-1].date;
            $log.debug('minDate',$scope.minDate);
            $log.debug('maxDate',$scope.maxDate);
            $scope.open = function() {
                $scope.isOpen = true;
            };
            $scope.$watch('selection',function(date) {
                $log.debug('selection',date);
                var fmt = 'longDate',
                    formattedDate = dateFilter(date,fmt);
                $scope.layer.extent.current = $scope.layer.extent.values.reduce(function(current,value){
                    return current||(formattedDate === dateFilter(value.date,fmt) ? value : undefined);
                },undefined);
            });
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-layer-control
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Directive to control categorized selection of WMS layers.  This directive
 * shares the parent scope.
 */
.directive('mapVisLayerControl',['$log',function($log){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/layer-control.html',
        link: function($scope) {
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-legend
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Directive to dynamically display an interactive legend for a seleted map layer.
 *
 * @scope
 * @param {object} legend The legend of the currently selected layer.
 */
.directive('mapVisLegend',['$log','$window',function($log,$window){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/legend.html',
        scope: {
            legend: '='
        },
        link: function($scope,$element) {
            function redraw() {
                var legend = $scope.legend,
                    svg = d3.select('.legend');

                svg.selectAll('g').remove(); // clean slate
                if(!legend) {
                    return;
                }
                $log.debug('legend.title',legend.getTitle());
                $log.debug('legend.length',legend.length);
                $log.debug('legend.colors',legend.getColors());
                $log.debug('legend.quantities',legend.getQuantities());
                $log.debug('legend.labels',legend.getLabels());
                $log.debug('legend.original_labels',legend.getOriginalLabels());

                var width = parseFloat(svg.style('width').replace('px','')),
                    height = parseFloat(svg.style('height').replace('px','')),
                    data = legend.getData(),
                    cell_width = width/data.length,
                    cell_height = 30;
                $log.debug('svg dimensions',width,height);
                $log.debug('legend cell width',cell_width);

                var g = svg.append('g');
                g.selectAll('g.cell')
                 .data(data)
                 .enter()
                 .append('g')
                 .attr('class','cell')
                 .attr('transform',function(d,i) { return 'translate('+(i*cell_width)+',0)'; })
                 .append('rect')
                 .attr('height',cell_height)
                 .attr('width',cell_width)
                 .style('stroke','black')
                 .style('stroke-width','1px')
                 .style('fill',function(d,i) { return d.color; })
                 .append('title')
                 .text(function(d) { return d.label; });

                var tick_length = 5,
                    tick_padding = 3;

                function label_cell(cell,label,anchor) {
                    var tick_start = (cell_height+tick_padding);
                    cell.append('line')
                        .attr('x1',(cell_width/2))
                        .attr('y1',tick_start)
                        .attr('x2',(cell_width/2))
                        .attr('y2',tick_start+tick_length)
                        .attr('stroke','black')
                        .attr('stroke-width','1');
                    cell.append('text')
                        .attr('dx',(cell_width/2))
                        .attr('dy','3.8em'/*cell_height+tick_length+(2*tick_padding)*/) // need to know line height of text
                        .style('text-anchor',anchor)
                        .text(label);
                }
                var cells = g.selectAll('g.cell')[0],
                    mid_idx = Math.floor(cells.length/2);
                label_cell(d3.select(cells[0]),data[0].label,'start');
                label_cell(d3.select(cells[mid_idx]),data[mid_idx].label,'middle');
                label_cell(d3.select(cells[cells.length-1]),data[data.length-1].label,'end');
            }
            $scope.$watch('legend',redraw);
            $($window).bind('resize',redraw);
            $scope.$on('$destroy',function(){
                $log.debug('legend removing resize handler');
                $($window).unbind('resize',redraw);
            });
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-in-situ-control
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Directive to control addition of in-situ data to the visualization map.
 *
 * @scope
 * @param {object} layer The currently selected map layer.
 */
.directive('mapVisInSituControl',['$log','FilterService',function($log,FilterService){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/in-situ-control.html',
        scope: {
            layer: '='
        },
        link: function($scope) {
            var filter = FilterService.getFilter(),
                dateArg = filter.getDateArg();
            $scope.years = d3.range(dateArg.getStartYear(),dateArg.getEndYear()+1);
            $scope.selection = {
                year: $scope.years[0]
            };
            filter.getSpeciesList().then(function(list){
                $log.debug('speciesList',list);
                $scope.speciesList = list;
                $scope.selection.species = list.length ? list[0] : undefined;
            });
            $scope.$watch('selection.species',function(species){
                $scope.phenophaseList = [];
                if(species) {
                    FilterService.getFilter().getPhenophasesForSpecies(species.species_id).then(function(list){
                        $log.debug('phenophaseList',list);
                        $scope.phenophaseList = list;
                        $scope.selection.phenophase = list.length ? list[0] : undefined;
                    });
                }
            });
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-geo-layer
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Transfers any geojson features from the base map to the vis map based on GeoFilterArgs.
 * This is strictly for visual effect.  If such geofilter args are in play on then the filtered results
 * will be used when placing in-situ data and as such markers will be similarly constrained.
 *
 * @scope
 */
.directive('mapVisGeoLayer',['$log','$q','$timeout','uiGmapIsReady','FilterService',function($log,$q,$timeout,uiGmapIsReady,FilterService){
    return {
        restrict: 'E',
        template: '',
        scope: {},
        link: function($scope,$element,$attrs) {
            var geoArgs = FilterService.getFilter().getGeoArgs(),
                mapContainer = $element.parent().parent().find('.angular-google-map-container');
            if(geoArgs.length) {
                $timeout(function(){
                    // this is a comlete hack but there appears to be no valid way to put features/polygons below a
                    // custom map layer.
                    $(mapContainer.children().first().children().first().children().first().children()[1]).css('z-index','99');
                },1000);
                uiGmapIsReady.promise(2).then(function(instances){
                    var baseMap = instances[0].map,
                        visMap = instances[1].map,
                        featurePromises = geoArgs.map(function(arg){
                            var def = $q.defer();
                            // arg.arg is the actual Google Maps API Feature that was
                            // selected on the base map which then needs to be translatedback
                            // to valid geojson.
                            arg.arg.toGeoJson(function(json){
                                def.resolve(json);
                            });
                            return def.promise;
                        });
                    $q.all(featurePromises).then(function(features){
                        visMap.data.addGeoJson({
                            type: 'FeatureCollection',
                            features: features
                        });
                        visMap.data.setStyle(function(feature){
                            return {
                                clickable: false,
                                strokeColor: '#666',
                                strokeOpacity: null,
                                strokeWeight: 1,
                                fillColor: '#800000',
                                fillOpacity: null,
                                zIndex: 0
                            };
                        });
                    });
                });
            }

        }
    };
}])
/**
 * @ngdoc controller
 * @name npn-viz-tool.vis-map:MapVisCtrl
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Controller for the gridded data map visualization dialog.
 */
.controller('MapVisCtrl',['$scope','$uibModalInstance','$filter','$log','$compile','$timeout','uiGmapGoogleMapApi','uiGmapIsReady','RestrictedBoundsService','WmsService','WcsService',
    function($scope,$uibModalInstance,$filter,$log,$compile,$timeout,uiGmapGoogleMapApi,uiGmapIsReady,RestrictedBoundsService,WmsService,WcsService){
        var api,
            map,
            infoWindow,
            boundsRestrictor = RestrictedBoundsService.getRestrictor('map_vis');
        $scope.modal = $uibModalInstance;
        $scope.wms_map = {
            center: { latitude: 48.35674, longitude: -122.39658 },
            zoom: 3,
            options: {
                disableDoubleClickZoom: true, // click on an arbitrary point gets gridded data so disable zoom (use controls).
                scrollwheel: false,
                streetViewControl: false,
                panControl: false,
                zoomControl: true,
                zoomControlOptions: {
                    style: google.maps.ZoomControlStyle.SMALL,
                    position: google.maps.ControlPosition.RIGHT_TOP
                }
            },
            events: {
                click: function(m,ename,args) {
                    var ev = args[0];
                    $log.debug('click',ev);
                    if($scope.selection.activeLayer) {
                        WcsService.getGriddedData($scope.selection.activeLayer,ev.latLng,4/*should gridSize change based on the layer?*/)
                            .then(function(tuples){
                                var html,compiled;
                                $log.debug('tuples',tuples);
                                $scope.gridded_point_data = tuples && tuples.length ? tuples[0] : undefined;
                                if(typeof($scope.gridded_point_data) === 'undefined') {
                                    return;
                                }
                                if(!infoWindow) {
                                    infoWindow = new api.InfoWindow({
                                        maxWidth: 200,
                                        content: 'contents'
                                    });
                                }
                                $scope.gridded_point_legend = $scope.legend ? $scope.legend.getPointData($scope.gridded_point_data) : undefined;
                                if($scope.gridded_point_legend){
                                    $log.debug('data from legend:',$scope.gridded_point_data,$scope.gridded_point_legend);
                                    html = '<div><div id="griddedPointInfoWindow" class="ng-cloak">';
                                    html += '<div class="gridded-legend-color" style="background-color: {{gridded_point_legend.color}};">&nbsp;</div>';
                                    html += '<div class="gridded-point-data">{{legend.formatPointData(gridded_point_data)}} ({{gridded_point_data | number:0}})</div>';
                                    //html += '<pre>\n{{gridded_point_data}}\n{{gridded_point_legend}}</pre>';
                                    html += '</div></div>';
                                    compiled = $compile(html)($scope);
                                    $timeout(function(){
                                        infoWindow.setContent(compiled.html());
                                        infoWindow.setPosition(ev.latLng);
                                        infoWindow.open(map);
                                    });
                                } else {
                                    infoWindow.setContent($filter('number')($scope.gridded_point_data,1)); // TODO: precision is likely layer specific
                                    infoWindow.setPosition(ev.latLng);
                                    infoWindow.open(map);
                                }

                            },function() {
                                // TODO?
                                $log.error('unable to get gridded data.');
                            });
                    }
                },
                center_changed: boundsRestrictor.center_changed
            }
        };
        uiGmapGoogleMapApi.then(function(maps){
            api = maps;
            uiGmapIsReady.promise(2).then(function(instances){
                map = instances[1].map;
                WmsService.getLayers(map).then(function(layers){
                    $log.debug('layers',layers);
                    $scope.layers = layers;
                },function(){
                    $log.error('unable to get map layers?');
                });
            });
        });

        $scope.selection = {};
        $scope.$watch('selection.layerCategory',function(category) {
            $log.debug('layer category change ',category);
            if($scope.selection.activeLayer) {
                $log.debug('turning off layer ',$scope.selection.activeLayer.name);
                $scope.selection.activeLayer.off();
                delete $scope.selection.activeLayer;
                delete $scope.legend;
            }
        });
        $scope.$watch('selection.layer',function(layer) {
            if(!layer) {
                return;
            }
            if(infoWindow) {
                infoWindow.close();
            }
            $log.debug('selection.layer',layer);
            if($scope.selection.activeLayer) {
                $log.debug('turning off layer ',$scope.selection.activeLayer.name);
                $scope.selection.activeLayer.off();
            }
            // looks odd that we're not turning the layer on here
            // but updating the activeLayer reference will also result in
            // the selection.activeLayer.extent.current watch firing which
            // toggles the map off/on
            $log.debug('fitting new layer ',layer.name);
            $scope.selection.activeLayer = layer.fit().on();
            boundsRestrictor.setBounds(layer.getBounds());
            delete $scope.legend;
            $scope.selection.activeLayer.getLegend(layer).then(function(legend){
                $scope.legend = legend;
            });
        });
        $scope.$watch('selection.activeLayer.extent.current',function(v) {
            if($scope.selection.activeLayer) {
                $log.debug('layer extent change ',$scope.selection.activeLayer.name,v);
                $scope.selection.activeLayer.off().on();
            }
        });
}]);
/**
 * @ngdoc overview
 * @name npn-viz-tool.vis-map-services
 * @description
 *
 * Service support for gridded data map visualization.
 */
angular.module('npn-viz-tool.vis-map-services',[
])
/**
 * @ngdoc filter
 * @name npn-viz-tool.vis-map-services:thirtyYearAvgDayOfYear
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Filter that translates a doy value (number) into date text of 'Month day'
 * this filter uses a base year of 2010 since the 30 yr avg layers are based on
 * 1981-2010 and 2010 is known to have been a 365 day year (unlike, for instance,
 * 2016 which has 366 days).
 */
.filter('thirtyYearAvgDayOfYear',['dateFilter',function(dateFilter){
    var JAN_ONE = new Date(2010/*(new Date()).getFullYear()*/,0),
        ONE_DAY = (24*60*60*1000);
    return function(doy,return_date) {
        if(typeof(doy) === 'string') {
            doy = parseFloat(doy);
        }
        var date = doy instanceof Date ? doy : new Date(JAN_ONE.getTime()+((doy-1)*ONE_DAY));
        return return_date ? date : dateFilter(date,'MMMM d');
    };
}])
/**
 * @ngdoc filter
 * @name npn-viz-tool.vis-map-services:legendDoy
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Simplified version of thirtyYearAvgDayOfYear that simply takes a number day of year
 * and returns a formatted date.  The optional second argument defines the date format
 * which defaults to 'MMM d'.  The optional third argument defines whether or not the
 * current year should be used as oposed to one known to have 365 days (2010).
 *
 * This filter equates doy 0 with doy 1 since legend scales are inconsistent in this regard.
 *
 * @example
 * <pre>
 * $filter('legendDoy')(1.0,undefined,true|false|undefined); // Jan 1
 * </pre>
 */
.filter('legendDoy',['dateFilter',function(dateFilter){
    var JAN_ONE_2010 = new Date(2010/*(new Date()).getFullYear()*/,0),
        JAN_ONE_THIS_YEAR = new Date((new Date()).getFullYear(),0),
        ONE_DAY = (24*60*60*1000);
    return function(doy,fmt,current_year) {
        if(doy === 0) {
            doy = 1;
        }
        fmt = fmt||'MMM d'; // e.g. Jan 1
        return dateFilter(new Date((current_year ? JAN_ONE_THIS_YEAR : JAN_ONE_2010).getTime()+((doy-1)*ONE_DAY)),fmt);
    };
}])
/**
 * @ngdoc filter
 * @name npn-viz-tool.vis-map-services:legendDegrees
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Formats legend numbers in degrees, assumes F if no unit supplied.
 *
 * @example
 * <pre>
 * $filter('legendDegrees')(10) // 10&deg;F
 * </pre>
 */
.filter('legendDegrees',['numberFilter',function(numberFilter){
    return function(n,unit) {
        return numberFilter(n,0)+'\u00B0'+(unit||'F');
    };
}])
/**
 * @ngdoc filter
 * @name npn-viz-tool.vis-map-services:legendAgddAnomaly
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Formats legend numbers for agdd anomaly layers.
 */
.filter('legendAgddAnomaly',['numberFilter',function(numberFilter){
    return function(n) {
        if(n === 0) {
            return 'No Difference';
        }
        var lt = n < 0;
        return numberFilter(Math.abs(n),0)+'\u00B0F '+(lt ? '<' : '>') +' Avg';
    };
}])
/**
 * @ngdoc filter
 * @name npn-viz-tool.vis-map-services:legendSixAnomaly
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Formats legend numbers for spring index anomaly layers
 */
.filter('legendSixAnomaly',[function(){
    return function(n) {
        if(n === 0) {
            return 'No Difference';
        }
        var lt = n < 0,
            abs = Math.abs(n);
        if(abs === 20) { // this is very weird but it's in alignment with how the original scale was built.
            abs = 10;
        }
        return abs+' Days '+(lt ? 'Early' : 'Late');
    };
}])
/**
 * @ngdoc filter
 * @name npn-viz-tool.vis-map-services:extentDates
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Filters an array of extent dates relative to days.
 * @example
 * <pre>
 * //$filter('extentDates')(dates,<after>,<before>);
 * $filter('extentDates')(dates,undefined,'today'); // before today
 * $filter('extentDates')(dates,'today',undefined); // after today
 * $filter('extentDates')(dates,undefined,'05-01'); // before may 1st of this year
 * $filter('extentDates')(dates,undefined,'2020-05-01T00:00:00.000Z'); // before may 1st of 2020
 * </pre>
 */
.filter('extentDates',['$log','dateFilter',function($log,dateFilter){
    var ONE_DAY = (24*60*60*1000);
    function toTime(s) {
        var d = new Date();
        if(s === 'yesterday' || s === 'today' || s === 'tomorrow') {
            if(s === 'yesterday') {
                d.setTime(d.getTime()-ONE_DAY);
            } else if (s === 'tomorrow') {
                d.setTime(d.getTime()+ONE_DAY);
            }
            s = dateFilter(d,'yyyy-MM-dd 00:00:00');
        } else if(s.indexOf('T') === -1) {
            s = d.getFullYear()+'-'+s+' 00:00:00';
        }
        return (new Date(s.replace(/T.*$/,' 00:00:00'))).getTime();
    }
    return function(arr,after,before) {
        var a = after ? toTime(after) : undefined,
            b = before ? toTime(before) : undefined;
        if(a || b) {
            arr = arr.filter(function(d) {
                var t = (new Date(d.replace(/T.*$/,' 00:00:00'))).getTime();
                return (!a || (a && t > a)) && (!b || (b && t < b));
            });
        }
        return arr;
    };
}])
/**
 * @ngdoc service
 * @name npn-viz-tool.vis-map-services:WmsService
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Interacts with the NPN geoserver WMS instance to supply map layer data.
 *
 * This service is driven by the <code>map-vis-layers.json</code> JSON document which
 * defines categorized organization for layers known to be supported by the geoserver instance.
 * In addition it specifies what UI code may be involved for formatting legend/gridded data points
 * as strings and valid extent values (despite what the geoserver capabilities may report).
 * The list of layers exposed by the map visualization will almost certainly be a re-organized subset
 * of those exposed by the geoserver.
 *
 * The JSON document exposes a single object with a single property <code>categories</code> which is an array
 * of objects (an object rather than array is used to ease later extention if necessaary).
 * Each "category" has, at a minimum, a <code>name</code> and <code>layers</code> property.
 * The <code>layers</code> property is an array of "layer" objects which, at a minimum, contain a <code>title</code>
 * and <code>name</code> properties.  The layer <code>name</code> contains the machine name of the associated WMS layer.
 *
 * Each category or layer can also have <code>legend_label_filter</code> and/or </code>extent_values_filter</code> properties.
 * If defined at the category level then all layers will inherit these values otherwise individual layers can define/override
 * the property values if defined at the category level.
 *
 * Both the <code>legend_label_filter</code> and </code>extent_values_filter</code> define an object that names an angular <code>$filter</code>
 * instance and optional arguments to that filter.
 * E.g.
 * <pre>
{
    "categories": [
    ...
    ,{
        "name": "Current Year AGDD",
        "legend_label_filter": {
            "name": "legendDegrees",
            "args": ["F"]
        },
        "extent_values_filter": {
            "name": "extentDates",
            "args": [null,"today"]
        },
        "layers":[{
                "title": "32\u00B0F",
                "name": "gdd:agdd"
            },{
                "title": "50\u00B0F",
                "name": "gdd:agdd_50f"
            }]
    },
    ...
    ]
}
 * </pre>
 *
 * The "Current Year AGDD" category contains two layers.  For both layers the same <code>legend_label_filter</code>
 * will be applied to format numbers to strings for use in displaying the legend and gridded data retrived from the WCS.
 * Similarly both layers will use the same <code>extent_values_filter</code> whilch will filter valid extent values as reported
 * by the WMS to only those <em>before</em> "today".
 */
.service('WmsService',['$log','$q','$http','$httpParamSerializer','$filter',function($log,$q,$http,$httpParamSerializer,$filter){
    var LAYER_CONFIG = $http.get('map-vis-layers.json'),
        WMS_BASE_URL = 'http://geoserver.usanpn.org/geoserver/wms',
        // not safe to change since the capabilities document format changes based on version
        // so a version change -may- require code changes wrt interpreting the document
        WMS_VERSION = '1.1.1',
        WMS_CAPABILITIES_URL = WMS_BASE_URL+'?service=wms&version='+WMS_VERSION+'&request=GetCapabilities',
        wms_layer_config,
        wms_layer_defs,
        legends = {},
        service = {
            baseUrl: WMS_BASE_URL,
            /**
             * @ngdoc method
             * @methodOf npn-viz-tool.vis-map-services:WmsService
             * @name  getLayers
             * @description
             *
             * Get the layers supported by the WMS service (work in progress, list will be a categorized subset eventually).
             *
             * @param {google.maps.Map} map The base map the fetched layers will be added to.
             * @return {promise} A promise that will be resolved with the layers, or rejected.
             */
            getLayers: function(map) {
                function mergeLayersIntoConfig() {
                    var result = angular.copy(wms_layer_config);
                    result.categories.forEach(function(category){
                        // layers can inherit config like filters (if all in common) from
                        // the base category
                        var base_config = angular.copy(category);
                        delete base_config.name;
                        delete base_config.layers;
                        category.layers = category.layers.map(function(l){
                            return new WmsMapLayer(map,angular.extend(angular.copy(base_config),wms_layer_defs[l.name],l));
                        });
                    });
                    return result;
                }
                var def = $q.defer();
                if(wms_layer_config && wms_layer_defs) {
                    def.resolve(mergeLayersIntoConfig());
                } else {
                    // TODO need to deal with failures
                    LAYER_CONFIG.then(function(response){
                        wms_layer_config = response.data;
                        $log.debug('layer_config',response.data);
                        $http.get(WMS_CAPABILITIES_URL).then(function(response){
                            var wms_capabilities = $($.parseXML(response.data));
                            wms_layer_defs = getLayers(wms_capabilities.find('Layer'));
                            $log.debug('wms_layer_defs',wms_layer_defs);
                            def.resolve(mergeLayersIntoConfig());
                        },def.reject);
                    },def.reject);

                }
                return def.promise;
            }
        };

    function WmsMapLegend(color_map,ldef) {
        var lformat = ldef.legend_label_filter ?
                (function(){
                    var filter = $filter(ldef.legend_label_filter.name);
                    return function(l,q) {
                        var args = [q];
                        if(ldef.legend_label_filter.args) {
                            args = args.concat(ldef.legend_label_filter.args);
                        }
                        return filter.apply(undefined, args);
                    };
                })() : angular.identity,
            data = color_map.find('ColorMapEntry').toArray().reduce(function(arr,entry,i){
                var e = $(entry),
                    q = parseFloat(e.attr('quantity')),
                    l = e.attr('label');
                arr.push({
                    color: e.attr('color'),
                    quantity: q,
                    original_label: l,
                    label: i === 0 ? l : lformat(l,q)
                });
                return arr;
            },[]);
        this.ldef = ldef;
        this.lformat = lformat;
        this.title_data = data[0];
        this.data = data.slice(1);
        this.length = this.data.length;
    }
    WmsMapLegend.prototype.getData = function() {
        return this.data;
    };
    WmsMapLegend.prototype.getTitle = function() {
        return this.title_data.label;
    };
    WmsMapLegend.prototype.getColors = function() {
        return this.data.map(function(data){ return data.color; });
    };
    WmsMapLegend.prototype.getQuantities = function() {
        return this.data.map(function(data){ return data.quantity; });
    };
    WmsMapLegend.prototype.getLabels = function() {
        return this.data.map(function(data){ return data.label; });
    };
    WmsMapLegend.prototype.getOriginalLabels = function() {
        return this.data.map(function(data){ return data.original_label; });
    };
    WmsMapLegend.prototype.formatPointData = function(q) {
        return this.lformat(q,q);
    };
    WmsMapLegend.prototype.getPointData = function(q) {
        var i,d,n;
        for(i = 0; i < this.data.length; i++) {
            d = this.data[i];
            n = (i+1) < this.data.length ? this.data[i+1] : undefined;
            if(q == d.quantity) {
                return d;
            }
            if(n && q >= d.quantity && q < n.quantity) {
                return d;
            }
        }
    };

    function WmsMapLayer(map,layer_def) {
        if(layer_def.extent_values_filter) {
            $log.debug('layer has an extent values filter, processing',layer_def.extent_values_filter);
            var valuesFilter = $filter(layer_def.extent_values_filter.name),
                extentValues = layer_def.extent.values.map(function(e){ return e.value; }),
                filterArgs = [extentValues].concat(layer_def.extent_values_filter.args||[]),
                filteredValues;
            $log.debug('filterArgs',filterArgs);
            filteredValues = valuesFilter.apply(undefined,filterArgs);
            $log.debug('filteredValues',filteredValues);
            layer_def.extent.values = layer_def.extent.values.filter(function(v) {
                return filteredValues.indexOf(v.value) !== -1;
            });
            if(layer_def.extent.current && filteredValues.indexOf(layer_def.extent.current.value) === -1) {
                $log.debug('current extent value has become invalid, replacing with last option');
                layer_def.extent.current = layer_def.extent.values.length ? layer_def.extent.values[layer_def.extent.values.length-1] : undefined;
            }
        }
        var wmsArgs = {
            service: 'WMS',
            request: 'GetMap',
            version: WMS_VERSION,
            layers: layer_def.name,
            styles: '',
            format: 'image/png',
            transparent: true,
            height: 256,
            width: 256,
            srs: 'EPSG:3857' // 'EPSG:4326'
        },
        googleLayer = new google.maps.ImageMapType({
            getTileUrl: function (coord, zoom) {
                var proj = map.getProjection(),
                    zfactor = Math.pow(2, zoom),
                    top = proj.fromPointToLatLng(new google.maps.Point(coord.x * 256.0 / zfactor, coord.y * 256.0 / zfactor)),
                    bot = proj.fromPointToLatLng(new google.maps.Point((coord.x + 1) * 256.0 / zfactor, (coord.y + 1) * 256.0 / zfactor)),
                    ctop = srsConversion(top),
                    cbot = srsConversion(bot),
                    base = {};
                if(l.extent && l.extent.current) {
                    l.extent.current.addToWmsParams(base);
                }
                return WMS_BASE_URL+'?'+$httpParamSerializer(angular.extend(base,wmsArgs,{bbox: [ctop.lng,cbot.lat,cbot.lng,ctop.lat].join(',')}));
            },
            tileSize: new google.maps.Size(256, 256),
            isPng: true,
            name: (layer_def.title||layer_def.name)
        }),
        l = angular.extend({},layer_def,{
            getMap: function() {
                return map;
            },
            getBounds: function() {
                if(layer_def.bbox) {
                    return layer_def.bbox.getBounds();
                }
            },
            fit: function() {
                var bounds = l.getBounds();
                if(bounds) {
                    map.fitBounds(bounds);
                }
                return l;
            },
            on: function() {
                map.overlayMapTypes.push(googleLayer);
                return l;
            },
            off: function() {
                if(map.overlayMapTypes.length) {
                    map.overlayMapTypes.pop();
                }
                return l;
            },
            getLegend: function() {
                var def = $q.defer();
                if(legends.hasOwnProperty(layer_def.name)) {
                    def.resolve(legends[layer_def.name]);
                } else {
                    //http://geoserver.usanpn.org/geoserver/wms?request=GetStyles&layers=gdd%3A30yr_avg_agdd&service=wms&version=1.1.1
                    $http.get(WMS_BASE_URL,{
                        params: {
                            service: 'wms',
                            request: 'GetStyles',
                            version: WMS_VERSION,
                            layers: layer_def.name,
                        }
                    }).then(function(response) {
                        $log.debug('legend response',response);
                        var legend_data = $($.parseXML(response.data)),
                            color_map = legend_data.find('ColorMap');
                        // this code is selecting the first if there are multiples....
                        // as is the case for si-x:leaf_anomaly
                        legends[layer_def.name] = color_map.length !== 0 ? new WmsMapLegend($(color_map.toArray()[0]),layer_def) : undefined;
                        def.resolve(legends[layer_def.name]);
                    },def.reject);
                }
                return def.promise;
            }
        });
        return l;
        // this code converts coordinates from ESPG:4326 to ESPG:3857, it originated @
        // http://gis.stackexchange.com/questions/52188/google-maps-wms-layer-with-3857
        // that author stated it came from StackOverflow which I tried to find to attribute properly but could not.
        // the issue here is that if requests are sent to the map service with ESPG:4326 coordinates everything
        // appears accurate when tightly zoomed however as you zoom out beyond a certain point the layers begin to
        // migrate north, the farther zoomed out the more drastic the migration (e.g. from Mexico into N. Canada)
        // while dealing in traditional lat/lng for google maps they are actually projected in 3857 (metres, not meters).
        // the main thing is that 4326 coordinates are projected onto a sphere/ellipsoid while 3857 are translated to
        // a flat surface.
        // unfortunately while google maps projection must be performing such transformations it doesn't expose this ability.
        function srsConversion(latLng) {
            if ((Math.abs(latLng.lng()) > 180 || Math.abs(latLng.lat()) > 90)) {
                return;
            }

            var num = latLng.lng() * 0.017453292519943295;
            var x = 6378137.0 * num;
            var a = latLng.lat() * 0.017453292519943295;

            return {lng: x, lat: 3189068.5 * Math.log((1.0 + Math.sin(a)) / (1.0 - Math.sin(a)))};
        }
    }
    // returns an associative array of machine name layer to layer definition
    function getLayers(layers) {
        if(!layers || layers.length < 2) { // 1st layer is parent, children are the real layers
            return;
        }
        // make it a normal array, not a jQuery one
        var ls = [];
        layers.slice(1).each(function(i,o) {
            ls.push(o);
        });
        return ls.map(layerToObject).reduce(function(map,l){
            map[l.name] = l;
            return map;
        },{});
    }
    function layerToObject(layer) {
        var l = $(layer);
        var o = {
            name: l.find('Name').first().text(),
            title: l.find('Title').first().text(),
            abstract: l.find('Abstract').first().text(),
            bbox: parseBoundingBox(l.find('EX_GeographicBoundingBox').first()),
            style: parseStyle(l.find('Style').first()),
            extent: parseExtent(l.find('Extent').first())
        };
        if(!o.bbox) {
            o.bbox = parseLatLonBoundingBox(l.find('LatLonBoundingBox').first());
        }
        return o;
    }
    function parseStyle(style) {
        var s = $(style);
        return {
            name: s.find('Name').first().text(),
            title: s.find('Title').first().text(),
            legend: s.find('OnlineResource').attr('xlink:href') // not very specific...
        };
    }
    function parseLatLonBoundingBox(bb) {
        if(bb.length) {
            var bbox = {
                westBoundLongitude: parseFloat(bb.attr('minx')),
                eastBoundLongitude: parseFloat(bb.attr('maxx')),
                southBoundLatitude: parseFloat(bb.attr('miny')),
                northBoundLatitude: parseFloat(bb.attr('maxy')),
                getBounds: function() { // TODO, cut/paste
                    return new google.maps.LatLngBounds(
                        new google.maps.LatLng(bbox.southBoundLatitude,bbox.westBoundLongitude), // sw
                        new google.maps.LatLng(bbox.northBoundLatitude,bbox.eastBoundLongitude) // ne
                    );
                }
            };
            return bbox;
        }
    }
    function parseBoundingBox(bb) {
        if(bb.length) {
            var bbox = {
                westBoundLongitude: parseFloat(bb.find('westBoundLongitude').text()),
                eastBoundLongitude: parseFloat(bb.find('eastBoundLongitude').text()),
                southBoundLatitude: parseFloat(bb.find('southBoundLatitude').text()),
                northBoundLatitude: parseFloat(bb.find('northBoundLatitude').text()),
                getBounds: function() {
                    return new google.maps.LatLngBounds(
                        new google.maps.LatLng(bbox.southBoundLatitude,bbox.westBoundLongitude), // sw
                        new google.maps.LatLng(bbox.northBoundLatitude,bbox.eastBoundLongitude) // ne
                    );
                }
            };
            // some bounding boxes seem to be messed up with lat/lons of 0 && -1
            // so if any of those numbers occur throw away the bounding box.
            return ![bbox.westBoundLongitude,bbox.eastBoundLongitude,bbox.southBoundLatitude,bbox.northBoundLatitude].reduce(function(v,n){
                return v||(n === 0 || n === -1);
            },false) ? bbox : undefined;
        }
    }
    // represents an extent value of month/day/year
    function DateExtentValue(value,dateFmt) {
        var d = new Date(value.replace(/T.*$/,' 00:00:00')); // remove GMT, parse as if relative to local TZ
        return {
            value: value,
            date: d,
            label: $filter('date')(d,(dateFmt||'longDate')),
            addToWmsParams: function(params) {
                params.time = value;
            },
            addToWcsParams: function(params) {
                if(!params.subset) {
                    params.subset = [];
                }
                params.subset.push('http://www.opengis.net/def/axis/OGC/0/time("'+value+'")');
            }
        };
    }
    // represents an extent value of day of year
    function DoyExtentValue(value) {
        return {
            value: value,
            label: $filter('thirtyYearAvgDayOfYear')(value),
            addToWmsParams: function(params) {
                params.elevation = value;
            },
            addToWcsParams: function(params) {
                if(!params.subset) {
                    params.subset = [];
                }
                params.subset.push('http://www.opengis.net/def/axis/OGC/0/elevation('+value+')');
            }
        };
    }
    function parseExtent(extent) {
        var e = $(extent),
            content = e.text(),
            dfltValue = e.attr('default'),
            dflt,values,
            name = e.attr('name'),
            start,end,yearFmt = 'yyyy',i;
        if(!name || !content) {
            return undefined;
        }
        function findDefault(current,value) {
            return current||(value.value == dfltValue ? value : undefined);
        }
        if(name === 'time') {
            if(content.indexOf('/') === -1) { // for now skip <lower>/<upper>/<resolution>
                values = content.split(',').map(function(d) { return new DateExtentValue(d); });
                // ugh
                dfltValue = dfltValue.replace(/0Z/,'0.000Z'); // extent values in ms preceision but not the default...
                dflt = values.reduce(findDefault,undefined);
                return {
                    label: 'Date',
                    type: 'date',
                    current: dflt, // bind the extent value to use here
                    values: values
                };
            } else {
                values = /^([^\/]+)\/(.*)\/P1Y$/.exec(content);
                if(values && values.length === 3) {
                    start = new DateExtentValue(values[1],yearFmt);
                    end = new DateExtentValue(values[2],yearFmt);
                    if(end.date.getFullYear() > start.date.getFullYear()) { // should never happen but to be safe
                        values = [start];
                        for(i = start.date.getFullYear()+1; i < end.date.getFullYear();i++) {
                            values.push(new DateExtentValue(i+'-01-01T00:00:00.000Z',yearFmt));
                        }
                        values.push(end);
                        return {
                            label: 'Year',
                            type: 'year',
                            current: end,
                            values: values
                        };
                    }
                }
            }
        } else if (name === 'elevation') {
            values = content.split(',').map(function(e) { return new DoyExtentValue(e); });
            dflt = values.reduce(findDefault,undefined);
            return {
                label: 'Day of Year',
                type: 'doy',
                current: dflt, // bind the extent value to use here
                values: values
            };
        }
    }
    return service;
}])
/**
 * @ngdoc service
 * @name npn-viz-tool.vis-map-services:WcsService
 * @module npn-viz-tool.vis-map-services
 * @description
 *
 * Interacts with the NPN geoserver WCS instance to supply underlying gridded data.  Loading of this service
 * extends the protypes of Number and the google.maps.LatLng class.
 */
.service('WcsService',['$log','$q','$http','uiGmapGoogleMapApi',function($log,$q,$http,uiGmapGoogleMapApi){
    // technically we should store and use a promise here but the WcsService
    // can't be interacted with until the Google Maps API is init'ed so just doing this
    // and later using it understanding the work has been done.
    uiGmapGoogleMapApi.then(function(maps){
        $log.debug('WcsService: adding functionality to Number/Google Maps prototypes.');
        Number.prototype.toRad = function() {
           return this * Math.PI / 180;
        };
        Number.prototype.toDeg = function() {
           return this * 180 / Math.PI;
        };
        // 0=N,90=E,180=S,270=W dist in km
        maps.LatLng.prototype.destinationPoint = function(brng, dist) {
           dist = dist / 6371;
           brng = brng.toRad();

           var lat1 = this.lat().toRad(), lon1 = this.lng().toRad();

           var lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist) +
                                Math.cos(lat1) * Math.sin(dist) * Math.cos(brng));

           var lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(dist) *
                                        Math.cos(lat1),
                                        Math.cos(dist) - Math.sin(lat1) *
                                        Math.sin(lat2));

           if (isNaN(lat2) || isNaN(lon2)) {
                return null;
            }

           return new google.maps.LatLng(lat2.toDeg(), lon2.toDeg());
        };
    });
    var WCS_BASE_URL = 'http://geoserver.usanpn.org:80/geoserver/wcs',
        service = {
            /**
             * @ngdoc method
             * @methodOf npn-viz-tool.vis-map-services:WcsService
             * @name  getGriddedData
             * @description
             *
             * Fetch gridded data for a specific location on a specific map layer.
             *
             * @param {object} activeLayer The map layer returned from the WcsService that the data to fetch is associated with.
             * @param {google.maps.LatLng} latLng The point under which to fetch the data for.
             * @param {number} gridSize The side of the grid to ask the WCS service data for (the larger the gridSize the more data).
             * @return {promise} A promise that will be resolved with an array of numbers, or rejected.
             */
            getGriddedData: function(activeLayer,latLng,gridSize) {
                var def = $q.defer(),
                edges = [0,80,180,270].map(function(bearing) {
                    return latLng.destinationPoint(bearing,(gridSize/2));
                }),
                wcsArgs = {
                    service: 'WCS',
                    request: 'GetCoverage',
                    version: '2.0.1',
                    coverageId: activeLayer.name.replace(':','__'), // convention
                    format: 'application/gml+xml',
                    subset: []
                },
                url;
                // add edges
                wcsArgs.subset.push('http://www.opengis.net/def/axis/OGC/0/Long('+[edges[3].lng(),edges[1].lng()].join(',')+')');
                wcsArgs.subset.push('http://www.opengis.net/def/axis/OGC/0/Lat('+[edges[2].lat(),edges[0].lat()].join(',')+')');
                if(activeLayer.extent && activeLayer.extent.current) {
                    activeLayer.extent.current.addToWcsParams(wcsArgs);
                }
                $log.debug('wcsArgs',wcsArgs);
                $http.get(WCS_BASE_URL,{
                    params: wcsArgs
                }).then(function(response){
                    $log.debug('wcs response',response);
                    var wcs_data = $($.parseXML(response.data)),
                        // this is crazy simple minded, at this time. not sure if it needs to get
                        // more sophisticated.  there's a lot more info in the resulting gml document
                        // which may or may not be of interest.
                        tuples = wcs_data.find('tupleList').text();
                    $log.debug('wcs_data',wcs_data);
                    $log.debug('tuples',tuples);
                    if(tuples) {
                        def.resolve(tuples.trim().split(' ').map(function(tuple) { return parseFloat(tuple); }));
                    } else {
                        def.reject();
                    }
                },def.reject);
                return def.promise;
            }
        };
    return service;
}]);
angular.module('templates-npnvis', ['js/calendar/calendar.html', 'js/filter/choroplethInfo.html', 'js/filter/dateFilterTag.html', 'js/filter/filterControl.html', 'js/filter/filterTags.html', 'js/filter/networkFilterTag.html', 'js/filter/speciesFilterTag.html', 'js/layers/layerControl.html', 'js/map/map.html', 'js/mapvis/date-control.html', 'js/mapvis/doy-control.html', 'js/mapvis/in-situ-control.html', 'js/mapvis/layer-control.html', 'js/mapvis/legend.html', 'js/mapvis/mapvis.html', 'js/mapvis/year-control.html', 'js/scatter/scatter.html', 'js/settings/settingsControl.html', 'js/toolbar/tool.html', 'js/toolbar/toolbar.html', 'js/vis/visControl.html', 'js/vis/visDialog.html', 'js/vis/visDownload.html']);

angular.module("js/calendar/calendar.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/calendar/calendar.html",
    "<vis-dialog title=\"Calendar\" modal=\"modal\">\n" +
    "<form class=\"form-inline plot-criteria-form\">\n" +
    "    <div class=\"form-group\">\n" +
    "        <label for=\"yearsOneInput\">Select up to two years</label>\n" +
    "        <input id=\"yearsOneInput\" type=\"number\" class=\"form-control\"\n" +
    "               ng-model=\"selection.year\"\n" +
    "               uib-typeahead=\"year for year in validYears | filter:$viewValue\"\n" +
    "               required placeholder=\"Year\" />\n" +
    "        <button class=\"btn btn-default\" ng-click=\"addYear()\" ng-disabled=\"!canAddYear()\"><i class=\"fa fa-plus\"></i></button>\n" +
    "    </div>\n" +
    "    <div class=\"form-group animated-show-hide\">\n" +
    "        <label for=\"speciesInput\">Species phenophase combinations</label>\n" +
    "        <select name=\"speciesInput\" class=\"form-control\" ng-model=\"selection.species\" ng-options=\"(o|speciesTitle) for o in speciesList\"></select>\n" +
    "        <select name=\"phenophaseInput\" class=\"form-control\" ng-model=\"selection.phenophase\" ng-options=\"o.phenophase_name for o in phenophaseList\"></select>\n" +
    "        <div class=\"btn-group\" uib-dropdown is-open=\"selection.color_isopen\">\n" +
    "          <button type=\"button\" class=\"btn btn-default dropdown-toggle\" uib-dropdown-toggle style=\"background-color: {{colorRange[selection.color]}};\">\n" +
    "            &nbsp; <span class=\"caret\"></span>\n" +
    "          </button>\n" +
    "          <ul class=\"dropdown-menu\" role=\"menu\">\n" +
    "            <li ng-repeat=\"i in colors track by $index\" style=\"background-color: {{colorRange[$index]}};\"><a href ng-click=\"selection.color=$index;\">&nbsp;</a></li>\n" +
    "          </ul>\n" +
    "        </div>\n" +
    "        <button class=\"btn btn-default\" ng-click=\"addToPlot()\" ng-disabled=\"!canAddToPlot()\"><i class=\"fa fa-plus\"></i></button>\n" +
    "    </div>\n" +
    "</form>\n" +
    "\n" +
    "<div class=\"panel panel-default main-vis-panel\" >\n" +
    "    <div class=\"panel-body\">\n" +
    "        <center ng-if=\"error_message\"><p class=\"text-danger\">{{error_message}}</p></center>\n" +
    "        <center>\n" +
    "        <ul class=\"to-plot list-inline animated-show-hide\" ng-if=\"toPlot.length || toPlotYears.length\">\n" +
    "            <li class=\"criteria\" ng-repeat=\"y in toPlotYears\">{{y}}\n" +
    "                <a href ng-click=\"removeYear($index)\"><i class=\"fa fa-times-circle-o\"></i></a>\n" +
    "            </li>\n" +
    "            <li class=\"criteria\" ng-repeat=\"tp in toPlot\">{{tp|speciesTitle}}/{{tp.phenophase_name}} <i style=\"color: {{colorRange[tp.color]}};\" class=\"fa fa-circle\"></i>\n" +
    "                <a href ng-click=\"removeFromPlot($index)\"><i class=\"fa fa-times-circle-o\"></i></a>\n" +
    "            </li>\n" +
    "            <li ng-if=\"data\">\n" +
    "                <label for=\"negativeInput\">Negative Data</label>\n" +
    "                <input type=\"checkbox\" id=\"negativeInput\" ng-model=\"selection.negative\" />\n" +
    "            </li>\n" +
    "            <li ng-if=\"!data && toPlotYears.length && toPlot.length\"><button class=\"btn btn-primary\" ng-click=\"visualize()\">Visualize</button></li>\n" +
    "        </ul>\n" +
    "        <div id=\"vis-container\">\n" +
    "            <div id=\"vis-working\" ng-show=\"working\"><i class=\"fa fa-circle-o-notch fa-spin fa-5x\"></i></div>\n" +
    "            <div class=\"chart-container\">\n" +
    "                <vis-download ng-if=\"data\"\n" +
    "                              selector=\".chart\"\n" +
    "                              filename=\"npn-calendar.png\"></vis-download>\n" +
    "                <div><svg class=\"chart\"></svg></div>\n" +
    "            </div>\n" +
    "        </div>\n" +
    "        </center>\n" +
    "        <ul class=\"list-inline calendar-chart-controls\" ng-if=\"data\" style=\"float: right;\">\n" +
    "            <li>Label Size\n" +
    "                <a href class=\"btn btn-default btn-xs\" ng-click=\"decrFontSize()\"><i class=\"fa fa-minus\"></i></a>\n" +
    "                <a href class=\"btn btn-default btn-xs\" ng-click=\"incrFontSize()\"><i class=\"fa fa-plus\"></i></a>\n" +
    "            </li>\n" +
    "            <li>Label Position\n" +
    "                <a href class=\"btn btn-default btn-xs\" ng-click=\"yAxisConfig.labelOffset=(yAxisConfig.labelOffset-1)\"><i class=\"fa fa-minus\"></i></a>\n" +
    "                <a href class=\"btn btn-default btn-xs\" ng-click=\"yAxisConfig.labelOffset=(yAxisConfig.labelOffset+1)\"><i class=\"fa fa-plus\"></i></a>\n" +
    "            </li>\n" +
    "            <li>Band Size\n" +
    "                <a href class=\"btn btn-default btn-xs\" ng-click=\"incrBandPadding()\" ng-disabled=\"yAxisConfig.bandPadding >= 0.95\"><i class=\"fa fa-minus\"></i></a>\n" +
    "                <a href class=\"btn btn-default btn-xs\" ng-click=\"decrBandPadding()\" ng-disabled=\"yAxisConfig.bandPadding <= 0.05\"><i class=\"fa fa-plus\"></i></a>\n" +
    "            </li>\n" +
    "        </ul>\n" +
    "    </div>\n" +
    "</div>\n" +
    "\n" +
    "</vis-dialog>");
}]);

angular.module("js/filter/choroplethInfo.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/filter/choroplethInfo.html",
    "<div id=\"choroplethHelp\" ng-show=\"show\">\n" +
    "    <h4>{{station_name}}</h4>\n" +
    "    <h5>Record Densit{{data.length == 1 ? 'y' : 'ies'}}</h5>\n" +
    "    <ul class=\"list-unstyled\">\n" +
    "        <li ng-repeat=\"scale in data\">\n" +
    "            <label>{{scale.title}} ({{scale.count}})</label>\n" +
    "            <ul class=\"list-inline color-scale\">\n" +
    "                <li ng-repeat=\"color in scale.colors\" style=\"background-color: {{color}};\" class=\"{{scale.color === color ? 'selected' :''}}\">\n" +
    "                    <div ng-if=\"$first\">{{scale.domain[0]}}</div>\n" +
    "                    <div ng-if=\"$last\">{{scale.domain[1]}}</div>\n" +
    "                </li>\n" +
    "            </ul>\n" +
    "        </li>\n" +
    "    </li>\n" +
    "</div>");
}]);

angular.module("js/filter/dateFilterTag.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/filter/dateFilterTag.html",
    "<div class=\"btn-group filter-tag date\">\n" +
    "    <a class=\"btn btn-default\">\n" +
    "        <span popover-placement=\"bottom\" popover-popup-delay=\"500\" popover-append-to-body=\"true\"\n" +
    "              popover-trigger=\"mouseenter\" uib-popover=\"Indicates the span of time represented on the map\">{{arg.arg.start_date}} - {{arg.arg.end_date}} </span>\n" +
    "        <span class=\"badge\"\n" +
    "              popover-placement=\"bottom\" popover-popup-delay=\"500\" popover-append-to-body=\"true\"\n" +
    "              popover-trigger=\"mouseenter\" uib-popover=\"{{badgeTooltip}}\">{{counts | speciesBadge:badgeFormat}}</span>\n" +
    "    </a>\n" +
    "    <a class=\"btn btn-default\" ng-click=\"removeFromFilter(arg)\">\n" +
    "        <i class=\"fa fa-times-circle-o\"></i>\n" +
    "    </a>\n" +
    "</div>");
}]);

angular.module("js/filter/filterControl.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/filter/filterControl.html",
    "<ul class=\"list-unstyled\">\n" +
    "    <li>\n" +
    "        <label for=\"yearInputForm\">Select up to ten (consecutive) years</label>\n" +
    "        <form id=\"yearInputForm\" name=\"yearInputForm\">\n" +
    "        <input id=\"start_date\" type=\"number\" class=\"form-control\"\n" +
    "               max=\"{{selected.date.end_date || thisYear}}\"\n" +
    "               ng-model=\"selected.date.start_date\"\n" +
    "               uib-typeahead=\"year for year in validYears | lte:selected.date.end_date | filter:$viewValue\"\n" +
    "               required placeholder=\"From\" /> - \n" +
    "        <input id=\"end_date\" type=\"number\" class=\"form-control\"\n" +
    "                min=\"{{selected.date.start_date || 1900}}\"\n" +
    "                ng-model=\"selected.date.end_date\"\n" +
    "                uib-typeahead=\"year for year in validYears | gte:selected.date.start_date | filter:$viewValue\"\n" +
    "                required placeholder=\"To\" />\n" +
    "        <button class=\"btn btn-default\"\n" +
    "                ng-disabled=\"yearInputForm.$invalid || ((selected.date.end_date - selected.date.start_date) > 10)\"\n" +
    "                ng-click=\"addDateRangeToFilter()\"\n" +
    "                popover-placement=\"right\" popover-popup-delay=\"500\" popover-append-to-body=\"true\"\n" +
    "                popover-trigger=\"mouseenter\" popover=\"Add this filter to the map\"><i class=\"fa fa-plus\"></i></button>\n" +
    "        </form>\n" +
    "        <p ng-if=\"selected.date.start_date < 2008\" class=\"disclaimer\">\n" +
    "            You have selected a starting year prior to 2008 when the contemprary phenology data begins.  Prior to 2008 there is\n" +
    "            a much more limited set of historical data and a limited number of species (E.g. lilac and honeysuckle).\n" +
    "        </p>\n" +
    "    </li>\n" +
    "    <li class=\"divider\" ng-if=\"filterHasDate()\"></li>\n" +
    "    <li ng-if=\"filterHasDate()\">\n" +
    "        <label>Animal Types</label>\n" +
    "        <div isteven-multi-select\n" +
    "            max-labels=\"3\"\n" +
    "            input-model=\"animalTypes\"\n" +
    "            output-model=\"speciesInput.animals\"\n" +
    "            button-label=\"species_type\"\n" +
    "            item-label=\"species_type\"\n" +
    "            tick-property=\"selected\"\n" +
    "            orientation=\"horizontal\"\n" +
    "            helper-elements=\"all none reset filter\"\n" +
    "            on-close=\"findSpecies()\"></div>\n" +
    "    </li>\n" +
    "    <li ng-if=\"filterHasDate()\">\n" +
    "        <label>Plant Types</label>\n" +
    "        <div isteven-multi-select\n" +
    "            max-labels=\"3\"\n" +
    "            input-model=\"plantTypes\"\n" +
    "            output-model=\"speciesInput.plants\"\n" +
    "            button-label=\"species_type\"\n" +
    "            item-label=\"species_type\"\n" +
    "            tick-property=\"selected\"\n" +
    "            orientation=\"horizontal\"\n" +
    "            helper-elements=\"all none reset filter\"\n" +
    "            on-close=\"findSpecies()\"></div>\n" +
    "    </li>\n" +
    "    <li ng-if=\"filterHasDate()\">\n" +
    "        <label>Partners</label>\n" +
    "        <div class=\"row\">\n" +
    "            <div class=\"col-xs-9\">\n" +
    "                <div isteven-multi-select\n" +
    "                    max-labels=\"3\"\n" +
    "                    input-model=\"partners\"\n" +
    "                    output-model=\"speciesInput.networks\"\n" +
    "                    button-label=\"network_name\"\n" +
    "                    item-label=\"network_name\"\n" +
    "                    tick-property=\"selected\"\n" +
    "                    orientation=\"horizontal\"\n" +
    "                    helper-elements=\"none reset filter\"\n" +
    "                    on-close=\"findSpecies()\"></div>\n" +
    "            </div>\n" +
    "            <div class=\"col-xs-3\">\n" +
    "                <button id=\"add-networks-button\" class=\"btn btn-default\"\n" +
    "                        ng-disabled=\"!speciesInput.networks.length || networksMaxedOut()\"\n" +
    "                        ng-click=\"addNetworksToFilter()\"\n" +
    "                        popover-placement=\"right\" popover-popup-delay=\"500\"\n" +
    "                        popover-trigger=\"mouseenter\" uib-popover=\"Add this filter to the map\" popover-append-to-body=\"true\">\n" +
    "                    <i class=\"fa fa-plus\"></i>\n" +
    "                </button>\n" +
    "            </div>\n" +
    "        </div>\n" +
    "\n" +
    "    </li>\n" +
    "    <li ng-if=\"filterHasDate()\">\n" +
    "        <label for=\"species\">Species</label>\n" +
    "        <div class=\"row\">\n" +
    "            <div class=\"col-xs-9\">\n" +
    "                <div isteven-multi-select\n" +
    "                    max-labels=\"3\"\n" +
    "                    input-model=\"speciesList\"\n" +
    "                    output-model=\"selected.species\"\n" +
    "                    button-label=\"display\"\n" +
    "                    item-label=\"display\"\n" +
    "                    tick-property=\"selected\"\n" +
    "                    orientation=\"horizontal\"\n" +
    "                    helper-elements=\"none reset filter\"></div>\n" +
    "            </div>\n" +
    "            <div class=\"col-xs-3\">\n" +
    "                <button id=\"add-species-button\" class=\"btn btn-default\"\n" +
    "                        ng-disabled=\"!selected.species.length || speciesMaxedOut()\"\n" +
    "                        ng-click=\"addSpeciesToFilter()\"\n" +
    "                        popover-placement=\"right\" popover-popup-delay=\"500\"\n" +
    "                        popover-trigger=\"mouseenter\" uib-popover=\"Add this filter to the map\" popover-append-to-body=\"true\">\n" +
    "                    <i class=\"fa\" ng-class=\"{'fa-refresh fa-spin': findingSpecies, 'fa-plus': !findingSpecies}\"></i>\n" +
    "                </button>\n" +
    "            </div>\n" +
    "        </div>\n" +
    "    </li>\n" +
    "    <li ng-if=\"filterHasDate()\" style=\"text-align: right;\">\n" +
    "        <a class=\"btn btn-lg btn-primary\" id=\"filter-placebo\" href ng-click=\"$parent.$parent.close()\" ng-disabled=\"!filterHasSufficientCriteria()\">Execute Filter <i class=\"fa fa-search\"></i></a>\n" +
    "    </li>\n" +
    "</ul>\n" +
    "");
}]);

angular.module("js/filter/filterTags.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/filter/filterTags.html",
    "<ul class=\"list-inline filter-tags\">\n" +
    "    <li ng-repeat=\"s in getFilter().getSpeciesArgs()\"><species-filter-tag arg=\"s\"></species-filter-tag></li>\n" +
    "    <li ng-repeat=\"n in getFilter().getNetworkArgs()\"><network-filter-tag arg=\"n\"></network-filter-tag></li>\n" +
    "    <li ng-if=\"(date = getFilter().getDateArg())\"><date-filter-tag arg=\"date\"></date-filter-tag></li>\n" +
    "</ul>");
}]);

angular.module("js/filter/networkFilterTag.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/filter/networkFilterTag.html",
    "<div class=\"btn-group filter-tag date\">\n" +
    "    <a class=\"btn btn-default\">\n" +
    "        {{arg.arg.network_name}} \n" +
    "        <span class=\"badge\"\n" +
    "              popover-placement=\"bottom\" popover-popup-delay=\"500\" popover-append-to-body=\"true\"\n" +
    "              popover-trigger=\"mouseenter\" uib-popover=\"{{badgeTooltip}}\">{{arg.counts | speciesBadge:badgeFormat}}</span>\n" +
    "    </a>\n" +
    "    <a class=\"btn btn-default\" ng-click=\"removeFromFilter(arg)\">\n" +
    "        <i class=\"fa fa-times-circle-o\"></i>\n" +
    "    </a>\n" +
    "</div>");
}]);

angular.module("js/filter/speciesFilterTag.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/filter/speciesFilterTag.html",
    "<div class=\"btn-group filter-tag\" ng-class=\"{open: status.isopen}\">\n" +
    "    <a class=\"btn btn-primary\" style=\"background-color: {{arg.color}};\" ng-disabled=\"!arg.phenophases\" ng-click=\"status.isopen = !status.isopen\">\n" +
    "        {{arg.arg | speciesTitle:titleFormat}} \n" +
    "        <span class=\"badge\"\n" +
    "              popover-placement=\"bottom\" popover-popup-delay=\"500\" popover-append-to-body=\"true\"\n" +
    "              popover-trigger=\"mouseenter\" uib-popover=\"{{badgeTooltip}}\">{{arg.counts | speciesBadge:badgeFormat}}</span> \n" +
    "        <span class=\"caret\"></span>\n" +
    "    </a>\n" +
    "    <ul class=\"dropdown-menu phenophase-list\" role=\"menu\">\n" +
    "        <li class=\"inline\">Select <a href ng-click=\"selectAll(true)\">all</a> <a href ng-click=\"selectAll(false)\">none</a></li>\n" +
    "        <li class=\"divider\"></li>\n" +
    "        <li ng-repeat=\"phenophase in arg.phenophases | filter:hasCount\">\n" +
    "            <input type=\"checkbox\" ng-model=\"phenophase.selected\"> <span class=\"badge\">{{phenophase.count}}</span> {{phenophase.phenophase_name}}\n" +
    "        </li>\n" +
    "    </ul>\n" +
    "    <a class=\"btn btn-primary\" style=\"background-color: {{arg.color}};\" ng-click=\"removeFromFilter(arg)\">\n" +
    "        <i class=\"fa fa-times-circle-o\"></i>\n" +
    "    </a>\n" +
    "</div>");
}]);

angular.module("js/layers/layerControl.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/layers/layerControl.html",
    "<p class=\"empty-filter-notes\" ng-if=\"isFilterEmpty()\">\n" +
    "    Before adding a layer to the map you must create and execute a filter.\n" +
    "    A map layer will allow you to filter sites based on the geographic boundaries it defines.\n" +
    "</p>\n" +
    "<ul class=\"list-unstyled\" ng-if=\"!isFilterEmpty()\">\n" +
    "    <li><label ng-class=\"{'selected-layer': layerOnMap.layer === 'none'}\"><a href ng-click=\"layerOnMap.layer='none'\">None</a></label>\n" +
    "        <!--input type=\"radio\" id=\"layer-none\" ng-model=\"layerOnMap.layer\" value=\"none\"/> <label for=\"layer-none\">None</label-->\n" +
    "    </li>\n" +
    "    <li ng-repeat=\"layer in layers\">\n" +
    "        <label  ng-class=\"{'selected-layer': layerOnMap.layer === layer}\">{{layer.label}}</label>\n" +
    "        <a href ng-click=\"layerOnMap.layer=layer\"><img ng-src=\"{{layer.img}}\" /></a>\n" +
    "        <ul class=\"list-inline layer-links\">\n" +
    "            <li ng-if=\"layer.link\"><a href=\"{{layer.link}}\" target=\"_blank\">More Info</a></li>\n" +
    "            <li ng-if=\"layer.source\"><a href=\"{{layer.source}}\" target=\"_blank\">Source</a></li>\n" +
    "        </ul>\n" +
    "    </li>\n" +
    "</ul>");
}]);

angular.module("js/map/map.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/map/map.html",
    "<a title=\"Reset\" href id=\"reset-control\" class=\"btn btn-default btn-xs\" ng-click=\"reset()\"><i class=\"fa fa-refresh\"></i></a>\n" +
    "\n" +
    "<npn-working></npn-working>\n" +
    "\n" +
    "<ui-gmap-google-map ng-if=\"map\" center='map.center' zoom='map.zoom' options=\"map.options\" events=\"map.events\">\n" +
    "    <npn-stations ng-if=\"stationView\"></npn-stations>\n" +
    "    <npn-filter-results></npn-filter-results>\n" +
    "    <bounds-manager></bounds-manager>\n" +
    "</ui-gmap-google-map>\n" +
    "\n" +
    "<share-control></share-control>\n" +
    "<export-control></export-control>\n" +
    "<filter-tags></filter-tags>\n" +
    "<choropleth-info></choropleth-info>\n" +
    "\n" +
    "<toolbar>\n" +
    "    <tool id=\"filter\" icon=\"fa-search\" title=\"Filter\">\n" +
    "        <filter-control></filter-control>\n" +
    "    </tool>\n" +
    "    <tool id=\"layers\" icon=\"fa-bars\" title=\"Layers\">\n" +
    "        <layer-control></layer-control>\n" +
    "    </tool>\n" +
    "    <tool id=\"visualizations\" icon=\"fa-bar-chart\" title=\"Visualizations\">\n" +
    "        <vis-control></vis-control>\n" +
    "    </tool>\n" +
    "    <tool id=\"settings\" icon=\"fa-cog\" title=\"Settings\">\n" +
    "        <settings-control></settings-control>\n" +
    "    </tool>\n" +
    "</toolbar>");
}]);

angular.module("js/mapvis/date-control.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/date-control.html",
    "<label>Date</label>\n" +
    "<p class=\"input-group\">\n" +
    "  <input type=\"text\" class=\"form-control\"\n" +
    "        uib-datepicker-popup=\"longDate\"\n" +
    "        ng-model=\"selection\"\n" +
    "        is-open=\"isOpen\"\n" +
    "        min-date=\"minDate\"\n" +
    "        max-date=\"maxDate\"\n" +
    "        close-text=\"Close\" />\n" +
    "  <span class=\"input-group-btn\">\n" +
    "    <button type=\"button\" class=\"btn btn-default\" ng-click=\"open()\"><i class=\"glyphicon glyphicon-calendar\"></i></button>\n" +
    "  </span>\n" +
    "</p>");
}]);

angular.module("js/mapvis/doy-control.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/doy-control.html",
    "<label>Day of Year</label>\n" +
    "<div class=\"form-inline\" style=\"margin-bottom: 15px;\">\n" +
    "    <div class=\"form-group\">\n" +
    "        <label for=\"selectedMonth\" class=\"sr-only\">Month</label>\n" +
    "        <select id=\"selectedMonth\" class=\"form-control\" ng-model=\"selection.month\"\n" +
    "                ng-options=\"m as (m | date:'MMMM') for m in months\"></select>\n" +
    "    </div>\n" +
    "    <div class=\"form-group\" ng-if=\"selection.month\">\n" +
    "        <label for=\"selectedDate\" class=\"sr-only\">Day</label>\n" +
    "        <select id=\"selectedDate\" class=\"form-control\" ng-model=\"selection.date\"\n" +
    "                ng-options=\"d for d in dates\"></select>\n" +
    "    </div>\n" +
    "</div>");
}]);

angular.module("js/mapvis/in-situ-control.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/in-situ-control.html",
    "<div class=\"in-situ-control\" ng-if=\"layer\">\n" +
    "    <hr />\n" +
    "    <div class=\"form-group\" ng-if=\"speciesList\">\n" +
    "        <label for=\"selectedSpecies\">Species</label>\n" +
    "        <select id=\"selectedSpecies\" class=\"form-control\" ng-model=\"selection.species\"\n" +
    "                ng-options=\"s as (s | speciesTitle) for s in speciesList\"></select>\n" +
    "    </div>\n" +
    "    <div class=\"form-group\" ng-if=\"selection.species && phenophaseList.length\">\n" +
    "        <label for=\"selectedPhenophse\">Species</label>\n" +
    "        <select id=\"selectedPhenophse\" class=\"form-control\" ng-model=\"selection.phenophase\"\n" +
    "                ng-options=\"p as p.phenophase_name for p in phenophaseList\"></select>\n" +
    "    </div>\n" +
    "    <div class=\"form-group\" ng-if=\"selection.species && selection.phenophase\">\n" +
    "        <label for=\"selectedYear\">Year</label>\n" +
    "        <select id=\"selectedYear\" class=\"form-control\" ng-model=\"selection.year\"\n" +
    "                ng-options=\"y as y for y in years\"></select>\n" +
    "    </div>\n" +
    "</div>");
}]);

angular.module("js/mapvis/layer-control.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/layer-control.html",
    "<div ng-if=\"layers\" class=\"map-vis-layer-control\">\n" +
    "    <div class=\"form-group\">\n" +
    "        <label for=\"selectedCategory\">Category</label>\n" +
    "        <select id=\"selectedCategory\" class=\"form-control\" ng-model=\"selection.layerCategory\"\n" +
    "                ng-options=\"cat as cat.name for cat in layers.categories\"></select>\n" +
    "    </div>\n" +
    "    <div class=\"form-group\" ng-if=\"selection.layerCategory\">\n" +
    "        <label for=\"selectedLayer\">Layer</label>\n" +
    "        <select id=\"selectedLayer\" class=\"form-control\" ng-model=\"selection.layer\"\n" +
    "                ng-options=\"l as (l.style.title + ' - ' + l.title) for l in selection.layerCategory.layers\"></select>\n" +
    "    </div>\n" +
    "    <div class=\"extent-control\" ng-if=\"selection.layer.extent\" ng-switch=\"selection.layer.extent.type\">\n" +
    "        <map-vis-doy-control ng-switch-when=\"doy\" layer=\"selection.layer\"></map-vis-doy-control>\n" +
    "        <map-vis-date-control ng-switch-when=\"date\" layer=\"selection.layer\"></map-vis-date-control>\n" +
    "        <map-vis-year-control ng-switch-when=\"year\" layer=\"selection.layer\"></map-vis-year-control>\n" +
    "    </div>\n" +
    "    <map-vis-opacity-slider layer=\"selection.layer\"></map-vis-opacity-slider>\n" +
    "    <p ng-if=\"selection.layer.abstract\">{{selection.layer.abstract}}</p>\n" +
    "</div>");
}]);

angular.module("js/mapvis/legend.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/legend.html",
    "<svg class=\"legend\"></svg>");
}]);

angular.module("js/mapvis/mapvis.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/mapvis.html",
    "<vis-dialog title=\"Map\" modal=\"modal\">\n" +
    "    <div class=\"container-fluid\">\n" +
    "        <div class=\"row\">\n" +
    "            <div class=\"col-xs-8\">\n" +
    "                <ui-gmap-google-map ng-if=\"wms_map\" center='wms_map.center' zoom='wms_map.zoom' options=\"wms_map.options\" events=\"wms_map.events\">\n" +
    "                    <map-vis-geo-layer></map-vis-geo-layer>\n" +
    "                    <map-vis-bounds-layer></map-vis-bounds-layer>\n" +
    "                </ui-gmap-google-map>\n" +
    "                <map-vis-legend legend=\"legend\"></map-vis-legend>\n" +
    "            </div>\n" +
    "            <div class=\"col-xs-4\">\n" +
    "                <map-vis-layer-control></map-vis-layer-control>\n" +
    "                <map-vis-in-situ-control layer=\"selection.layer\"></map-vis-in-situ-control>\n" +
    "            </div>\n" +
    "        </div>\n" +
    "    </div>\n" +
    "    <!--img ng-if=\"selection.activeLayer\" ng-src=\"{{selection.activeLayer.style.legend}}\" class=\"legend\" /-->\n" +
    "</vis-dialog>");
}]);

angular.module("js/mapvis/year-control.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/mapvis/year-control.html",
    "<div class=\"form-group\" ng-if=\"layer.extent\">\n" +
    "    <label for=\"selectedExtent\">Year</label>\n" +
    "    <select id=\"selectedExtent\" class=\"form-control\" ng-model=\"layer.extent.current\" ng-options=\"v as v.label for v in layer.extent.values\"></select>\n" +
    "</div>");
}]);

angular.module("js/scatter/scatter.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/scatter/scatter.html",
    "<vis-dialog title=\"Scatter Plot\" modal=\"modal\">\n" +
    "<form class=\"form-inline plot-criteria-form\">\n" +
    "    <div class=\"form-group\">\n" +
    "        <label for=\"speciesInput\">Select up to three species phenophase combinations</label>\n" +
    "        <select name=\"speciesInput\" class=\"form-control\" ng-model=\"selection.species\" ng-options=\"(o|speciesTitle) for o in speciesList\"></select>\n" +
    "        <select name=\"phenophaseInput\" class=\"form-control\" ng-model=\"selection.phenophase\" ng-options=\"o.phenophase_name for o in phenophaseList\"></select>\n" +
    "        <div class=\"btn-group\" uib-dropdown is-open=\"selection.color_isopen\">\n" +
    "          <button type=\"button\" class=\"btn btn-default dropdown-toggle\" uib-dropdown-toggle style=\"background-color: {{colorRange[selection.color]}};\">\n" +
    "            &nbsp; <span class=\"caret\"></span>\n" +
    "          </button>\n" +
    "          <ul class=\"dropdown-menu\" role=\"menu\">\n" +
    "            <li ng-repeat=\"i in colors track by $index\" style=\"background-color: {{colorRange[$index]}};\"><a href ng-click=\"selection.color=$index;\">&nbsp;</a></li>\n" +
    "          </ul>\n" +
    "        </div>\n" +
    "    </div>\n" +
    "    <button class=\"btn btn-default\" ng-click=\"addToPlot()\" ng-disabled=\"!canAddToPlot()\"><i class=\"fa fa-plus\"></i></button>\n" +
    "</form>\n" +
    "\n" +
    "<div class=\"panel panel-default main-vis-panel\" >\n" +
    "    <div class=\"panel-body\">\n" +
    "        <center>\n" +
    "        <ul class=\"to-plot list-inline animated-show-hide\" ng-if=\"toPlot.length\">\n" +
    "            <li class=\"criteria\" ng-repeat=\"tp in toPlot\">{{tp|speciesTitle}}/{{tp.phenophase_name}} <i style=\"color: {{colorRange[tp.color]}};\" class=\"fa fa-circle\"></i>\n" +
    "                <a href ng-click=\"removeFromPlot($index)\"><i class=\"fa fa-times-circle-o\"></i></a>\n" +
    "            </li>\n" +
    "            <li>\n" +
    "                <select class=\"form-control vis-axis\" ng-model=\"selection.axis\" ng-options=\"o as o.label for o in axis\"></select>\n" +
    "            </li>\n" +
    "            <li>\n" +
    "                <label for=\"fitLinesInput\">Fit Line{{toPlot.length > 1 ? 's' : ''}}</label>\n" +
    "                <input type=\"checkbox\" id=\"fitLinesInput\" ng-model=\"selection.regressionLines\" />\n" +
    "            </li>\n" +
    "            <li ng-if=\"!data\"><button class=\"btn btn-primary\" ng-click=\"visualize()\">Visualize</button></li>\n" +
    "        </ul>\n" +
    "        <div id=\"vis-container\">\n" +
    "            <div id=\"vis-working\" ng-show=\"working\"><i class=\"fa fa-circle-o-notch fa-spin fa-5x\"></i></div>\n" +
    "            <div class=\"chart-container\">\n" +
    "                <vis-download ng-if=\"data\"\n" +
    "                              selector=\".chart\"\n" +
    "                              filename=\"npn-scatter-plot.png\"></vis-download>\n" +
    "                <div><svg class=\"chart\"></svg></div>\n" +
    "            </div>\n" +
    "            <div ng-if=\"filteredDisclaimer\" class=\"filter-disclaimer\">For quality assurance purposes, only onset dates that are preceded by negative records are included in the visualization.</div>\n" +
    "        </div>\n" +
    "        </center>\n" +
    "    </div>\n" +
    "</div>\n" +
    "<!--pre ng-if=\"record\">{{record | json}}</pre-->\n" +
    "\n" +
    "</vis-dialog>");
}]);

angular.module("js/settings/settingsControl.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/settings/settingsControl.html",
    "<ul class=\"list-unstyled\">\n" +
    "    <li>\n" +
    "        <Label for=\"clusterMarkersSetting\">Cluster Markers</label>\n" +
    "        <ul class=\"list-unstyled\">\n" +
    "            <li ng-repeat=\"option in [true,false]\">\n" +
    "                <input type=\"radio\" id=\"clusterMarkers{{option}}\" ng-model=\"settings.clusterMarkers.value\"\n" +
    "                       ng-value=\"{{option}}\" /> <label for=\"clusterMarkers{{option}}\">{{option | yesNo}}</label>\n" +
    "            </li>\n" +
    "        </ul>\n" +
    "    </li>\n" +
    "    <li class=\"divider\"></li>\n" +
    "    <li>\n" +
    "        <label>Variable Displayed</label>\n" +
    "        <ul class=\"list-unstyled\">\n" +
    "            <li ng-repeat=\"option in settings.tagBadgeFormat.options\">\n" +
    "                <input type=\"radio\"\n" +
    "                       id=\"{{option.value}}\" ng-model=\"settings.tagBadgeFormat.value\"\n" +
    "                       value=\"{{option.value}}\"> <label for=\"{{option.value}}\">{{option.label}}</label>\n" +
    "            </li>\n" +
    "        </ul>\n" +
    "    </li>\n" +
    "    <li class=\"divider\"></li>\n" +
    "    <li>\n" +
    "        <label>Species Tag Title</label>\n" +
    "        <ul class=\"list-unstyled\">\n" +
    "            <li ng-repeat=\"option in settings.tagSpeciesTitle.options\">\n" +
    "                <input type=\"radio\"\n" +
    "                       id=\"{{option.value}}\" ng-model=\"settings.tagSpeciesTitle.value\"\n" +
    "                       value=\"{{option.value}}\"> <label for=\"{{option.value}}\">{{option.label}}</label>\n" +
    "            </li>\n" +
    "        </ul>\n" +
    "    </li>\n" +
    "    <li class=\"divider\"></li>\n" +
    "    <li>\n" +
    "        <label for=\"clusterMarkersSetting\">Exclude less precise data from visualizations</label>\n" +
    "        <ul class=\"list-unstyled\">\n" +
    "            <li ng-repeat=\"option in [true,false]\">\n" +
    "                <input type=\"radio\" id=\"filterLqdSummary{{option}}\" ng-model=\"settings.filterLqdSummary.value\"\n" +
    "                       ng-value=\"{{option}}\" /> <label for=\"filterLqdSummary{{option}}\">{{option | yesNo}}</label>\n" +
    "            </li>\n" +
    "        </ul>\n" +
    "        <p>Selecting <strong>Yes</strong> will exclude data points which lack a \"no\" record preceding the first \"yes\" record from certain visualizations. </p>\n" +
    "    </li>\n" +
    "</ul>");
}]);

angular.module("js/toolbar/tool.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/toolbar/tool.html",
    "<div class=\"tool-content {{title.toLowerCase()}}\" ng-show=\"selected\">\n" +
    "    <h2>{{title}}</h2>\n" +
    "    <div ng-transclude>\n" +
    "    </div>\n" +
    "</div>");
}]);

angular.module("js/toolbar/toolbar.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/toolbar/toolbar.html",
    "<div class=\"toolbar\">\n" +
    "  <ul class=\"tools-list\">\n" +
    "    <li ng-repeat=\"t in tools\" ng-class=\"{open: t.selected}\"\n" +
    "        popover-placement=\"right\" uib-popover=\"{{t.title}}\" popover-trigger=\"mouseenter\" popover-popup-delay=\"1000\"\n" +
    "        ng-click=\"select(t)\">\n" +
    "      <i id=\"toolbar-icon-{{t.id}}\" class=\"toolbar-icon fa {{t.icon}}\"></i>\n" +
    "    </li>\n" +
    "  </ul>\n" +
    "  <div class=\"toolbar-content\" ng-class=\"{open: open}\" ng-transclude></div>\n" +
    "</div>");
}]);

angular.module("js/vis/visControl.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/vis/visControl.html",
    "<p class=\"empty-filter-notes\" ng-if=\"isFilterEmpty()\">\n" +
    "    Before using a visualization you must create and execute a filter.\n" +
    "    Visualizations use the species, and sometimes, date ranges you've identified\n" +
    "    in your filter as the basis for what you want to visualize.\n" +
    "</p>\n" +
    "<ul class=\"list-unstyled\">\n" +
    "    <li ng-repeat=\"vis in visualizations\">\n" +
    "        <a href ng-click=\"open(vis)\" ng-class=\"{disabled: isFilterEmpty()}\">{{vis.title}}</a>\n" +
    "        <p>{{vis.description}}</p>\n" +
    "    </li>\n" +
    "</ul>");
}]);

angular.module("js/vis/visDialog.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/vis/visDialog.html",
    "<div class=\"modal-header\">\n" +
    "    <a href class=\"modal-dismiss\" ng-click=\"modal.dismiss()\"><i class=\"fa fa-times-circle-o fa-2x\"></i></a>\n" +
    "    <h3 class=\"modal-title\">{{title}}</h3>\n" +
    "</div>\n" +
    "<div class=\"modal-body vis-dialog {{title | cssClassify}}\" ng-transclude>\n" +
    "</div>");
}]);

angular.module("js/vis/visDownload.html", []).run(["$templateCache", function($templateCache) {
  $templateCache.put("js/vis/visDownload.html",
    "<div class=\"vis-download\">\n" +
    "    <a href ng-click=\"download()\" title=\"Download\"><i class=\"fa fa-download\"></i></a>\n" +
    "    <canvas id=\"visDownloadCanvas\" style=\"display: none;\"></canvas>\n" +
    "    <a id=\"vis-download-link\" style=\"display: none;\">download</a>\n" +
    "</div>");
}]);

angular.module('npn-viz-tool.vis-scatter',[
    'npn-viz-tool.vis',
    'npn-viz-tool.filter',
    'npn-viz-tool.filters',
    'npn-viz-tool.settings',
    'ui.bootstrap'
])
.controller('ScatterVisCtrl',['$scope','$uibModalInstance','$http','$timeout','$filter','$log','FilterService','ChartService','SettingsService',
    function($scope,$uibModalInstance,$http,$timeout,$filter,$log,FilterService,ChartService,SettingsService){
    $scope.modal = $uibModalInstance;
    var colorScale = FilterService.getColorScale();
    $scope.colors = colorScale.domain();
    $scope.colorRange = colorScale.range();

    $scope.axis = [
        {key: 'latitude', label: 'Latitude', axisFmt: d3.format('.2f')},
        {key: 'longitude', label: 'Longitude', axisFmt: d3.format('.2f')},
        {key:'elevation_in_meters',label:'Elevation (m)'},
        {key:'first_yes_year', label: 'Year'},

        {key:'prcp_fall',label:'Precip Fall (mm)'},
        {key:'prcp_spring',label:'Precip Spring (mm)'},
        {key:'prcp_summer',label:'Precip Summer (mm)'},
        {key:'prcp_winter',label:'Precip Winter (mm)'},

        {key:'tmax_fall',label:'Tmax Fall (C\xB0)'},
        {key:'tmax_spring',label:'Tmax Spring (C\xB0)'},
        {key:'tmax_summer',label:'Tmax Summer (C\xB0)'},
        {key:'tmax_winter',label:'Tmax Winter (C\xB0)'},

        {key:'tmin_fall',label:'Tmin Fall (C\xB0)'},
        {key:'tmin_spring',label:'Tmin Spring (C\xB0)'},
        {key:'tmin_summer',label:'Tmin Summer (C\xB0)'},
        {key:'tmin_winter',label:'Tmin Winter (C\xB0)'},

        {key:'daylength',label:'Day Length (s)'},
        {key:'acc_prcp',label:'Accumulated Precip (mm)'},
        {key:'gdd',label:'GDD'}
        ];

    var defaultAxisFmt = d3.format('d');
    function formatXTickLabels(i) {
        return ($scope.selection.axis.axisFmt||defaultAxisFmt)(i);
    }

    $scope.selection = {
        color: 0,
        axis: $scope.axis[0],
        regressionLines: false
    };
    $scope.$watch('selection.regressionLines',function(nv,ov) {
        if(nv !== ov) {
            draw();
        }
    });
    $scope.$watch('selection.axis',function(nv,ov) {
        if(nv !== ov) {
            draw();
        }
    });

    $scope.toPlot = [];
    FilterService.getFilter().getSpeciesList().then(function(list){
        $log.debug('speciesList',list);
        $scope.speciesList = list;
        if(list.length) {
            $scope.selection.species = list[0];
        }
    });
    $scope.$watch('selection.species',function(){
        $scope.phenophaseList = [];
        if($scope.selection.species) {
            FilterService.getFilter().getPhenophasesForSpecies($scope.selection.species.species_id).then(function(list){
                $log.debug('phenophaseList',list);
                $scope.phenophaseList = list;
                if(list.length) {
                    $scope.selection.phenophase = list[0];
                }
            });
        }
    });
    function advanceColor() {
        if($scope.selection.color < $scope.colors.length) {
            $scope.selection.color++;
        } else {
            $scope.selection.color = 0;
        }
    }
    function getNewToPlot() {
        return angular.extend({},$scope.selection.species,$scope.selection.phenophase,{color: $scope.selection.color});
    }
    $scope.canAddToPlot = function() {
        if($scope.toPlot.length === 3 || !$scope.selection.species || !$scope.selection.phenophase) {
            return false;
        }
        if($scope.toPlot.length === 0) {
            return true;
        }
        var next = getNewToPlot(),i;
        for(i = 0; i < $scope.toPlot.length; i++) {
            if(angular.equals($scope.toPlot[i],next)) {
                return false;
            }
        }
        for(i = 0; i < $scope.toPlot.length; i++) {
            if(next.color === $scope.toPlot[i].color) {
                return false;
            }
        }
        return true;
    };
    $scope.addToPlot = function() {
        if($scope.canAddToPlot()) {
            $scope.toPlot.push(getNewToPlot());
            advanceColor();
            $scope.data = data = undefined;
        }
    };
    $scope.removeFromPlot = function(idx) {
        $scope.toPlot.splice(idx,1);
        $scope.data = data = undefined;
    };

    var data, // the data from the server....
        dateArg = FilterService.getFilter().getDateArg(),
        start_year = dateArg.arg.start_date,
        start_date = new Date(start_year,0),
        end_year = dateArg.arg.end_date,
        sizing = ChartService.getSizeInfo({top: 80,left: 60}),
        chart,
        x = d3.scale.linear().range([0,sizing.width]).domain([0,100]), // bogus domain initially
        xAxis = d3.svg.axis().scale(x).orient('bottom').tickFormat(formatXTickLabels),
        y = d3.scale.linear().range([sizing.height,0]).domain([1,365]),
        d3_date_fmt = d3.time.format('%x'),
        local_date_fmt = function(d){
                var time = ((d-1)*ChartService.ONE_DAY_MILLIS)+start_date.getTime(),
                    date = new Date(time);
                return d3_date_fmt(date);
            },
        yAxis = d3.svg.axis().scale(y).orient('left');

    function commonChartUpdates() {
        var chart = d3.select('.chart');

        chart.selectAll('.axis path')
            .style('fill','none')
            .style('stroke','#000')
            .style('shape-rendering','crispEdges');
        chart.selectAll('.axis line')
            .style('fill','none')
            .style('stroke','#000')
            .style('shape-rendering','crispEdges');

        chart.selectAll('text')
            .style('font-family','Arial');

        chart.selectAll('.legend rect')
            .style('fill','white')
            .style('stroke','black')
            .style('opacity','0.8');

        var fontSize = '12px';

        chart.selectAll('.legend text')
             .style('font-size', fontSize)
             .attr('y',function(d,i){
                return (i*12) + i;
             });

        chart.selectAll('g .x.axis text')
            .style('font-size', fontSize);

        chart.selectAll('g .y.axis text')
            .style('font-size', fontSize);

        // em doesn't work when saving as an image
        var dyBase = -5,
            dyIncr = 14;
        chart.selectAll('.legend circle')
            .attr('r','5')
            .attr('cx','5')
            .attr('cy',function(d,i) {
                return dyBase + (i*dyIncr);
            });
    }

    // can't initialize the chart until the dialog is rendered so postpone its initialization a short time.
    $timeout(function(){
        var svg = d3.select('.chart')
            .attr('width', sizing.width + sizing.margin.left + sizing.margin.right)
            .attr('height', sizing.height + sizing.margin.top + sizing.margin.bottom);
        svg.append('g').append('rect').attr('width','100%').attr('height','100%').attr('fill','#fff');
        chart = svg.append('g')
            .attr('transform', 'translate(' + sizing.margin.left + ',' + sizing.margin.top + ')');

        var dateArg = FilterService.getFilter().getDateArg();
          chart.append('g')
               .attr('class','chart-title')
               .append('text')
               .attr('y', '0')
               .attr('dy','-3em')
               .attr('x', (sizing.width/2))
               .style('text-anchor','middle')
               .style('font-size','18px')
               .text(dateArg.getStartYear()+' - '+dateArg.getEndYear());
          chart.append('g')
              .attr('class', 'x axis')
              .attr('transform', 'translate(0,' + sizing.height + ')')
              .call(xAxis);

          chart.append('g')
              .attr('class', 'y axis')
              .call(yAxis)
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', '0')
            .attr('dy','-3em')
            .attr('x',-1*(sizing.height/2)) // looks odd but to move in the Y we need to change X because of transform
            .style('text-anchor', 'middle')
            .text('Onset DOY');

        commonChartUpdates();

    },500);

    function draw() {
        if(!data) {
            return;
        }
        $scope.working = true;
        // update the x-axis
        var padding = 1,
            nonNullData = data.filter(function(d){
                return d[$scope.selection.axis.key] != -9999;
            });
        function xData(d) { return d[$scope.selection.axis.key]; }
        x.domain([d3.min(nonNullData,xData)-padding,d3.max(nonNullData,xData)+padding]);
        xAxis.scale(x).tickFormat(d3.format('.2f')); // TODO per-selection tick formatting
        var xA = chart.selectAll('g .x.axis');
        xA.call(xAxis.tickFormat(formatXTickLabels));
        xA.selectAll('.axis-label').remove();
        xA.append('text')
          .attr('class','axis-label')
          .attr('x',(sizing.width/2))
          .attr('dy', '3em')
          .style('text-anchor', 'middle')
          .style('font-size', '12px')
          .text($scope.selection.axis.label);

        // update the chart data (TODO transitions??)
        var circles = chart.selectAll('.circle').data(nonNullData,function(d) { return d.id; });
        circles.exit().remove();
        circles.enter().append('circle')
          .attr('class', 'circle')
          .style('stroke','#333')
          .style('stroke-width','1');

        circles.attr('cx', function(d) { return x(d[$scope.selection.axis.key]); })
          .attr('cy', function(d) { return y(d.first_yes_doy); })
          .attr('r', '5')
          .attr('fill',function(d) { return d.color; })
          .on('click',function(d){
            if (d3.event.defaultPrevented){
                return;
            }
            $scope.$apply(function(){
                $scope.record = d;
            });
          })
          .append('title')
          .text(function(d) { return local_date_fmt(d.day_in_range)+ ' ['+d.latitude+','+d.longitude+']'; });

        var regressionLines = [],float_fmt = d3.format('.2f');
        angular.forEach($scope.toPlot,function(pair){
            var color = $scope.colorRange[pair.color],
                seriesData = nonNullData.filter(function(d) { return d.color === color; });
            if(seriesData.length > 0) {
                var datas = seriesData.sort(function(o1,o2){ // sorting isn't necessary but makes it easy to pick min/max x
                        return o1[$scope.selection.axis.key] - o2[$scope.selection.axis.key];
                    }),
                    xSeries = datas.map(function(d) { return d[$scope.selection.axis.key]; }).filter(angular.isNumber),
                    ySeries = datas.map(function(d) { return d.first_yes_doy; }).filter(angular.isNumber),
                    leastSquaresCoeff = ChartService.leastSquares(xSeries,ySeries),
                    x1 = xSeries[0],
                    y1 = ChartService.approxY(leastSquaresCoeff,x1),
                    x2 = xSeries[xSeries.length-1],
                    y2 = ChartService.approxY(leastSquaresCoeff,x2);
                regressionLines.push({
                    id: pair.species_id+'.'+pair.phenophase_id,
                    legend: $filter('speciesTitle')(pair)+'/'+pair.phenophase_name+
                            (($scope.selection.regressionLines && !isNaN(leastSquaresCoeff[2])) ? ' (R^2 = '+float_fmt(leastSquaresCoeff[2])+')' : ''),
                    color: color,
                    p1: [x1,y1],
                    p2: [x2,y2]
                });
            }
        });
        var regression = chart.selectAll('.regression')
            .data(regressionLines,function(d) { return d.id; });
        regression.exit().remove();
        regression.enter().append('line')
            .attr('class','regression');

        regression
            .attr('data-legend',function(d) { return d.legend; } )
            .attr('data-legend-color',function(d) { return d.color; })
            .attr('x1', function(d) { return x(d.p1[0]); })
            .attr('y1', function(d) { return y(d.p1[1]); })
            .attr('x2', function(d) { return x(d.p2[0]); })
            .attr('y2', function(d) { return y(d.p2[1]); })
            .attr('stroke', function(d) { return d.color; })
            .attr('stroke-width', $scope.selection.regressionLines ? 2 : 0);
            // FF doesn't like the use of display, so using stroke-width to hide
            // regression lines.
            //.style('display', $scope.selection.regressionLines ? 'inherit' : 'none');


        chart.select('.legend').remove();
        var legend = chart.append('g')
          .attr('class','legend')
          .attr('transform','translate(30,-45)') // relative to the chart, not the svg
          .style('font-size','1em')
          .call(d3.legend);

        if($scope.selection.regressionLines) {
            // IMPORTANT: This may not work perfectly on all browsers because of support for
            // innerHtml on SVG elements (or lack thereof) so using shim
            // https://code.google.com/p/innersvg/
            // d3.legend deals with, not onreasonably, data-legend as a simple string
            // alternatively extend d3.legend or do what it does here manually...
            // replace 'R^2' with 'R<tspan ...>2</tspan>'
            // the baseline-shift doesn't appear to work on firefox however
            chart.selectAll('.legend text').html(function(d) {
                    return d.key.replace('R^2','R<tspan style="baseline-shift: super; font-size: 8px;">2</tspan>');
                });
        }
        commonChartUpdates();
        $scope.working = false;
    }
    $scope.visualize = function() {
        if(data) {
            return draw();
        }
        $scope.working = true;
        $log.debug('visualize',$scope.selection.axis,$scope.toPlot);
        var dateArg = FilterService.getFilter().getDateArg(),
            params = {
                climate_data: 1,
                request_src: 'npn-vis-scatter-plot',
                start_date: dateArg.getStartDate(),
                end_date: dateArg.getEndDate()
            },
            i = 0,
            colorMap = {};
        angular.forEach($scope.toPlot,function(tp) {
            colorMap[tp.species_id+'.'+tp.phenophase_id] = tp.color;
            params['species_id['+i+']'] = tp.species_id;
            params['phenophase_id['+(i++)+']'] = tp.phenophase_id;
        });
        ChartService.getSummarizedData(params,function(response){
            var filterLqd = SettingsService.getSettingValue('filterLqdSummary');
            $scope.data = data = response.filter(function(d,i) {
                var keep = !filterLqd||d.numdays_since_prior_no >= 0;
                if(keep) {
                    d.color = $scope.colorRange[colorMap[d.species_id+'.'+d.phenophase_id]];
                    if(d.color) {
                        d.id = i;
                        // this is the day # that will get plotted 1 being the first day of the start_year
                        // 366 being the first day of start_year+1, etc.
                        d.day_in_range = ((d.first_yes_year-start_year)*365)+d.first_yes_doy;
                    } else {
                        // this can happen if a phenophase id spans two species but is only plotted for one
                        // e.g. boxelder/breaking leaf buds, boxelder/unfolding leaves, red maple/breaking leaf buds
                        // the service will return data for 'red maple/unfolding leaves' but the user hasn't requested
                        // that be plotted so we need to discard this data.
                        keep = false;
                    }
                }
                return keep;
            });
            $log.debug('filtered out '+(response.length-data.length)+'/'+response.length+' records with negative num_days_prior_no.');
            $scope.filteredDisclaimer = response.length != data.length;
            $log.debug('scatterPlot data',data);
            draw();
        });
    };
}]);
angular.module('npn-viz-tool.settings',[
    'npn-viz-tool.filters'
])
.factory('SettingsService',[function(){
    var settings = {
        clusterMarkers: {
            name: 'cluster-markers',
            q: 'cm',
            value: true
        },
        tagSpeciesTitle: {
            name: 'tag-species-title',
            q: 'tst',
            value: 'common-name',
            options: [{
                value: 'common-name',
                q: 'cn',
                label: 'Common Name'
            },{
                value: 'scientific-name',
                q: 'sn',
                label: 'Scientific Name'
            }]
        },
        tagBadgeFormat: {
            name: 'tag-badge-format',
            q: 'tbf',
            value: 'observation-count',
            options: [{
                value: 'observation-count',
                q: 'oc',
                label: 'Record Count'
            },{
                value: 'station-count',
                q: 'sc',
                label: 'Site Count'
            }/*,{
                value: 'station-observation-count',
                q: 'soc',
                label: 'Station Count/Record Count'
            }*/]
        },
        filterLqdSummary: {
            name: 'filter-lqd-summary',
            q: 'flqdf',
            value: true
        }
    };
    return {
        getSettings: function() { return settings; },
        getSetting: function(key) { return settings[key]; },
        getSettingValue: function(key) { return settings[key].value; },
        // @return the label of the currently selected value for a setting with options (or undefined).
        getSettingValueLabel: function(key) {
            var s = settings[key],
                v = s.value,i;
            for(i = 0; s.options && i < s.options.length; i++) {
                if(s.options[i].value === v) {
                    return s.options[i].label;
                }
            }
        },
        getSharingUrlArgs: function() {
            var arg = '',key,s,i;
            for(key in settings) {
                s = settings[key];
                arg+=(arg !== '' ? ';':'')+s.q+'=';
                if(!s.options) {
                    arg+=s.value;
                } else {
                    for(i = 0; i < s.options.length; i++) {
                        if(s.value === s.options[i].value) {
                            arg += s.options[i].q;
                            break;
                        }
                    }
                }
            }
            return 'ss='+encodeURIComponent(arg);
        },
        populateFromSharingUrlArgs: function(ss) {
            if(ss) {
                ss.split(';').forEach(function(st){
                    var pts = st.split('='),
                        q = pts[0], v = pts[1],key,i;
                    for(key in settings) {
                        if(settings[key].q === q) {
                            if(settings[key].options) {
                                for(i = 0; i < settings[key].options.length; i++) {
                                    if(settings[key].options[i].q === v) {
                                        settings[key].value = settings[key].options[i].value;
                                        break;
                                    }
                                }
                            } else {
                                settings[key].value = (v === 'true' || v === 'false') ? (v === 'true') : v;
                            }
                            break;
                        }
                    }
                });
            }
        }
    };
}])
.directive('settingsControl',['$rootScope','$location','$log','SettingsService',function($rootScope,$location,$log,SettingsService){
    return {
        restrict: 'E',
        templateUrl: 'js/settings/settingsControl.html',
        controller: function($scope) {
            SettingsService.populateFromSharingUrlArgs($location.search()['ss']);
            $scope.settings = SettingsService.getSettings();
            function broadcastSettingChange(key) {
                $log.debug('broadcastSettingChange',$scope.settings[key]);
                $rootScope.$broadcast('setting-update-'+key,$scope.settings[key]);
            }
            function setupBroadcast(key) {
                $scope.$watch('settings.'+key+'.value',function(oldV,newV){
                    broadcastSettingChange(key);
                });
            }
            for(var key in $scope.settings) {
                setupBroadcast(key);
            }
        }
    };
}]);
angular.module('npn-viz-tool.share',[
    'npn-viz-tool.filter',
    'npn-viz-tool.layers',
    'npn-viz-tool.settings',
    'uiGmapgoogle-maps'
])
/**
 * Important one and only one instance of this directive should ever be in use in the application
 * because upon instantiation it examines the current URL query args and uses its contents to
 * populate the filter, etc.
 */
.directive('shareControl',['uiGmapIsReady','FilterService','LayerService','DateFilterArg','SpeciesFilterArg','NetworkFilterArg','GeoFilterArg','BoundsFilterArg','$location','$log','SettingsService',
    function(uiGmapIsReady,FilterService,LayerService,DateFilterArg,SpeciesFilterArg,NetworkFilterArg,GeoFilterArg,BoundsFilterArg,$location,$log,SettingsService){
    return {
        restrict: 'E',
        template: '<a title="Share" href id="share-control" class="btn btn-default btn-xs" ng-disabled="!getFilter().hasSufficientCriteria()" ng-click="share()"><i class="fa fa-share"></i></a><div ng-show="url" id="share-content"><input type="text" class="form-control" ng-model="url" ng-blur="url = null" onClick="this.setSelectionRange(0, this.value.length)"/></div>',
        scope: {},
        controller: function($scope){
            FilterService.pause();
            uiGmapIsReady.promise(1).then(function(instances){
                var map = instances[0],
                    qargs = $location.search(),
                    speciesFilterCount = 0,
                    speciesFilterReadyCount = 0,
                    networksFilterCount = 0,
                    networksFilterReadyCount = 0,
                    layersReady = false,
                    layerListener,speciesListener,networksListener;
                function checkReady() {
                    if(layersReady && speciesFilterReadyCount === speciesFilterCount && networksFilterCount === networksFilterReadyCount) {
                        $log.debug('ready..');
                        // unsubscribe
                        layerListener();
                        speciesListener();
                        networksListener();
                        FilterService.resume();
                    }
                }
                layerListener = $scope.$on('layers-ready',function(event,data){
                    $log.debug('layers ready...');
                    layersReady = true;
                    checkReady();
                });
                speciesListener = $scope.$on('species-filter-ready',function(event,data){
                    $log.debug('species filter ready...',data);
                    speciesFilterReadyCount++;
                    checkReady();
                });
                networksListener = $scope.$on('network-filter-ready',function(event,data){
                    $log.debug('network filter ready...',data);
                    networksFilterReadyCount++;
                    checkReady();
                });
                function addSpeciesToFilter(s){
                    SpeciesFilterArg.fromString(s).then(FilterService.addToFilter);
                }
                function addNetworkToFilter(s) {
                    NetworkFilterArg.fromString(s).then(FilterService.addToFilter);
                }
                $log.debug('qargs',qargs);
                if(qargs['d'] && (qargs['s'] || qargs['n'])) {
                    // we have sufficient criteria to alter the filter...
                    FilterService.addToFilter(DateFilterArg.fromString(qargs['d']));
                    if(qargs['b']) {
                        qargs['b'].split(';').forEach(function(bounds_s){
                            FilterService.addToFilter(BoundsFilterArg.fromString(bounds_s,map.map));
                        });
                    }
                    if(qargs['s']) {
                        var speciesList = qargs['s'].split(';');
                        speciesFilterCount = speciesList.length;
                        speciesList.forEach(addSpeciesToFilter);
                    }
                    if(qargs['n']) {
                        var networksList = qargs['n'].split(';');
                        networksFilterCount = networksList.length;
                        networksList.forEach(addNetworkToFilter);
                    }
                } else {
                    FilterService.resume();
                }
            });

            $scope.getFilter = FilterService.getFilter;
            $scope.share = function() {
                if($scope.url) {
                    $scope.url = null;
                    return;
                }
                var filter = FilterService.getFilter(),
                    params = {},
                    absUrl = $location.absUrl(),
                    q = absUrl.indexOf('?');
                params['d'] = filter.getDateArg().toString();
                filter.getSpeciesArgs().forEach(function(s){
                    if(!params['s']) {
                        params['s'] = s.toString();
                    } else {
                        params['s'] += ';'+s.toString();
                    }
                });
                filter.getNetworkArgs().forEach(function(n){
                    if(!params['n']) {
                        params['n'] = n.toString();
                    } else {
                        params['n'] += ';'+n.toString();
                    }
                });
                filter.getGeoArgs().forEach(function(g){
                    if(!params['g']) {
                        params['g'] = g.toString();
                    } else {
                        params['g'] += ';'+g.toString();
                    }
                });
                filter.getBoundsArgs().forEach(function(b){
                    if(!params['b']) {
                        params['b'] = b.toString();
                    } else {
                        params['b'] += ';'+b.toString();
                    }
                });
                if(q != -1) {
                    absUrl = absUrl.substring(0,q);
                }
                absUrl += absUrl.indexOf('#') === -1 ? '#?' : '?';
                Object.keys(params).forEach(function(key,i){
                    absUrl += (i > 0 ? '&' : '') + key + '=' + encodeURIComponent(params[key]);
                });
                absUrl+='&'+SettingsService.getSharingUrlArgs();
                $log.debug('absUrl',absUrl);
                $scope.url = absUrl;
            };
        }
    };
}]);
angular.module('npn-viz-tool.stations',[
    'npn-viz-tool.filter',
    'npn-viz-tool.cluster',
    'npn-viz-tool.settings',
    'npn-viz-tool.layers',
    'npn-viz-tool.vis'
])
.factory('StationService',['$rootScope','$http','$log','FilterService','ChartService',function($rootScope,$http,$log,FilterService,ChartService){
    var infoWindow,
        markerEvents = {
        'click':function(m){
            if(infoWindow) {
                infoWindow.close();
                infoWindow = undefined;
            }
            //m.info = new google.maps.InfoWindow();
            //m.info.setContent('<div class="station-details"><i class="fa fa-circle-o-notch fa-spin"></i></div>');
            //m.info.open(m.map,m);
            $log.debug('Fetching info for station '+m.model.station_id);
            $http.get('/npn_portal/stations/getStationDetails.json',{params:{ids: m.model.station_id}}).success(function(info){
                function litem(label,value) {
                    return value && value !== '' ?
                     '<li><label>'+label+':</label> '+value+'</li>' : '';
                }
                if(info && info.length === 1) {
                    var i = info[0],
                        html = '<div class="station-details">';
                    $log.debug(i);
                    //html += '<h5>'+i.site_name+'</h5>';
                    html += '<ul class="list-unstyled">';
                    html += litem('Site Name',i.site_name);
                    html += litem('Group',i.group_name);
                    if(m.model.observationCount) {
                        html += litem('Records',m.model.observationCount);
                    } else {
                        html += litem('Individuals',i.num_individuals);
                        html += litem('Records',i.num_records);
                    }

                    html += '</ul>';
                    if(m.model.speciesInfo) {
                        html += '<label>Species Observed</label>';
                        html += '<ul class="list-unstyled">';
                        Object.keys(m.model.speciesInfo.titles).forEach(function(key){
                            var scale = FilterService.getChoroplethScale(key),
                                count = m.model.speciesInfo.counts[key];
                            html += '<li><div class="choropleth-swatch" style="background-color: '+scale(count)+';"></div>'+m.model.speciesInfo.titles[key]+' ('+count+')</li>';
                        });
                        html += '</ul>';
                    }
                    html += '</div>';
                    var details = $.parseHTML(html)[0];
                    if(!FilterService.isFilterEmpty()) {
                        var visualizations = ChartService.getVisualizations();
                        html = '<div>';
                        html += '<label>Visualize Site Data</label>';
                        html += '<ul class="list-unstyled">';
                        ChartService.getVisualizations().forEach(function(vis){
                            html += '<li>';
                            html += '<a id="'+vis.controller+'" href="#">'+vis.title+'</a>';
                            html += '</li>';
                        });
                        html += '</ul></div>';
                        var visLinks = $.parseHTML(html)[0];
                        $(details).append(visLinks);
                        ChartService.getVisualizations().forEach(function(vis){
                            var link = $(details).find('#'+vis.controller);
                            link.click(function(){
                                $rootScope.$apply(function(){
                                    ChartService.openSingleStationVisualization(m.model.station_id,vis);
                                });
                            });
                        });
                    }

                    infoWindow = new google.maps.InfoWindow({
                        maxWidth: 500,
                        content: details
                    });
                    infoWindow.open(m.map,m);
                }
            });
        }
    },
    service = {
        getMarkerEvents: function() { return markerEvents; }
    };
    return service;
}])
.directive('npnStations',['$http','$log','$timeout','LayerService','SettingsService','StationService','ClusterService',
    function($http,$log,$timeout,LayerService,SettingsService,StationService,ClusterService){
    return {
        restrict: 'E',
        template: '<ui-gmap-markers models="regions.markers" idKey="\'name\'" coords="\'self\'" icon="\'icon\'" options="\'markerOpts\'" isLabel="true"></ui-gmap-markers><ui-gmap-markers models="stations.markers" idKey="\'station_id\'" coords="\'self\'" icon="\'icon\'" options="\'markerOpts\'" doCluster="doCluster" events="markerEvents" clusterOptions="clusterOptions"></ui-gmap-markers>',
        scope: {
        },
        controller: ['$scope',function($scope) {
            $scope.doCluster = SettingsService.getSettingValue('clusterMarkers');
            $scope.$on('setting-update-clusterMarkers',function(event,data){
                $scope.doCluster = data.value;
            });
            var clusterOptions = ClusterService.getDefaultClusterOptions();
            $scope.clusterOptions = angular.extend(clusterOptions,{
                calculator: function(markers,styleCount) {
                    var r = {
                        text: markers.length,
                        index:1
                    };
                    for(var i = 0; i <clusterOptions.styles.length;i++) {
                        if(markers.length >= clusterOptions.styles[i].n) {
                            r.index = (i+1);
                        }
                    }
                    return r;
                }
            });
            $scope.regions = {
                markers: []
            };
            $scope.stations = {
                states: [],
                markers: []
            };
            $scope.markerEvents = StationService.getMarkerEvents();
            var eventListeners = [];
            $http.get('/npn_portal/stations/getStationCountByState.json').success(function(counts){
                var countMap = counts.reduce(function(map,c){
                    map[c.state] = c;
                    c.number_stations = parseInt(c.number_stations);
                    map.$min = Math.min(map.$min,c.number_stations);
                    map.$max = Math.max(map.$max,c.number_stations);
                    return map;
                },{$max: 0,$min: 0}),
                colorScale = d3.scale.linear().domain([countMap.$min,countMap.$max]).range(['#F7FBFF','#08306B']);

                LayerService.resetLayers().then(function(){
                    LayerService.loadLayer('primary',function(feature) {
                        var name = feature.getProperty('NAME'),
                            loaded = $scope.stations.states.indexOf(name) != -1,
                            count = countMap[name],
                            style = {
                                strokeOpacity: 1,
                                strokeColor: '#ffffff',
                                strokeWeight: 1,
                                fillOpacity: 0
                            };
                        if(count && !loaded ) {
                            count.visited = true;
                            style.fillOpacity = 0.8;
                            style.fillColor = colorScale(count.number_stations);
                            style.clickable = true;
                            var center = feature.getProperty('CENTER'),
                                regionMarker = angular.extend({
                                    name: name,
                                    icon: {
                                        path: google.maps.SymbolPath.CIRCLE,
                                        fillColor: '#000',
                                        fillOpacity: 0.5,
                                        scale: 16,
                                        strokeColor: '#ccc',
                                        strokeWeight: 1
                                    },
                                    markerOpts: {
                                        title: name + ' ('+count.number_stations+' Sites)',
                                        labelClass: 'station-count',
                                        labelContent: ''+count.number_stations
                                        }},center);
                            if(count.number_stations < 10) {
                                regionMarker.icon.scale = 8;
                                regionMarker.markerOpts.labelAnchor = '4 8';
                            } else if(count.number_stations < 100) {
                                regionMarker.icon.scale = 12;
                                regionMarker.markerOpts.labelAnchor = '8 8';
                            } else if(count.number_stations < 1000) {
                                regionMarker.icon.scale = 14;
                                regionMarker.markerOpts.labelAnchor = '10 8';
                            } else {
                                regionMarker.markerOpts.labelAnchor = '13 8';
                            }
                            $scope.$apply(function(){
                                $scope.regions.markers.push(regionMarker);
                            });
                        } else if (!loaded) {
                            $log.warn('no station count for '+name);
                        }
                        return style;
                    }).then(function(results){
                        var map = results[0];
                        eventListeners.push(map.data.addListener('mouseover',function(event){
                            map.data.overrideStyle(event.feature, {strokeWeight: 3});
                        }));
                        eventListeners.push(map.data.addListener('mouseout',function(event){
                            map.data.revertStyle();
                        }));
                        eventListeners.push(map.data.addListener('click',function(event){
                            var state = event.feature.getProperty('NAME');
                            if($scope.stations.states.indexOf(state) === -1) {
                                // remove the station count marker, splice doesn't work here.
                                $scope.regions.markers = $scope.regions.markers.filter(function(m){
                                    return m.name !== state;
                                });
                                $scope.stations.states.push(state);
                                $timeout(function(){
                                    // simply drop the feature as opposed to re-styling it
                                    map.data.remove(event.feature);
                                    map.panTo(event.latLng);
                                    var waitTime = 0;
                                    if(map.getZoom() != 6) {
                                        map.setZoom(6);
                                        waitTime = 500; // give more time for map tiles to load
                                    }
                                    $timeout(function(){
                                        $http.get('/npn_portal/stations/getAllStations.json',
                                                    {params:{state_code:state}})
                                            .success(function(data){
                                                data.forEach(function(d){
                                                    d.markerOpts = {
                                                        title: d.station_name,
                                                        icon: {
                                                            path: google.maps.SymbolPath.CIRCLE,
                                                            fillColor: '#e6550d',
                                                            fillOpacity: 1.0,
                                                            scale: 8,
                                                            strokeColor: '#204d74',
                                                            strokeWeight: 1
                                                        }
                                                    };
                                                });
                                                var newMarkers = $scope.stations.markers.concat(data),
                                                    n = (newMarkers.length > 512 ? Math.round(newMarkers.length/2) : 512),i;
                                                for(i = clusterOptions.styles.length-1; i >= 0; i--) {
                                                    clusterOptions.styles[i].n = n;
                                                    n = Math.round(n/2);
                                                }
                                                $scope.stations.markers = newMarkers;
                                            });
                                    },waitTime);
                                },500);
                            }
                        }));
                    });
                });
            });
            // may or may not be a good idea considering if other elements replace
            // map layers
            $scope.$on('$destroy',function(){
                LayerService.resetLayers();
                eventListeners.forEach(function(el){
                    el.remove();
                });
            });
        }]
    };
}]);
angular.module('npn-viz-tool.toolbar',[
  'npn-viz-tool.help'
])
.directive('toolbar', ['$rootScope','HelpService',function($rootScope,HelpService) {
  return {
    restrict: 'E',
    templateUrl: 'js/toolbar/toolbar.html',
    transclude: true,
    scope: {},
    controller: function($scope) {
      var tools = $scope.tools = [];
      function broadcastChange(t) {
        $rootScope.$broadcast('tool-'+(t.selected ? 'open' : 'close'),{
          tool: t
        });
      }
      $scope.select = function(t) {
        t.selected = !t.selected;
        $scope.open = t.selected;
        HelpService.stopLookingAtMe('#toolbar-icon-'+t.id); // mixing view/controller logic :-(
        broadcastChange(t);
      };
      this.addTool = function(t) {
        tools.push(t);
      };
      this.closeTool = function(t) {
        $scope.open = t.selected = false;
        broadcastChange(t);
      };
    }
  };
}])
.directive('tool', [function() {
  return {
    restrict: 'E',
    require: '^toolbar',
    templateUrl: 'js/toolbar/tool.html',
    transclude: true,
    scope: {
      id: '@',
      title: '@',
      icon: '@'
    },
    link: function(scope, element, attrs, tabsCtrl) {
      tabsCtrl.addTool(scope);
      scope.close = function() {
        tabsCtrl.closeTool(scope);
      };
    }
  };
}]);
angular.module('npn-viz-tool.vis',[
    'npn-viz-tool.filter',
    'npn-viz-tool.filters',
    'npn-viz-tool.vis-scatter',
    'npn-viz-tool.vis-calendar',
    'npn-viz-tool.vis-map',
    'ui.bootstrap'
])
.factory('ChartService',['$window','$http','$log','$uibModal','FilterService',
    function($window,$http,$log,$uibModal,FilterService){
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
            controller: 'MapVisCtrl',
            template: 'js/mapvis/mapvis.html',
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
                params['network['+i+']'] = n.getName();
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
                return $uibModal.open({
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