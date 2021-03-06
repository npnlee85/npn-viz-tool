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
        sizing = ChartService.getSizeInfo({top: 20, right: 35, bottom: 45, left: 35}),
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

	function phenophaseListUpdate() {
		$log.debug('Calling phenophase list update');
		$scope.phenophaseList = [];
		var species = $scope.selection.species.species_id,
			year = $scope.selection.year;

		if(species && year) {
			$scope.phenophaseList = [];
			FilterService.getFilter().getPhenophasesForSpecies(species,true,[year]).then(function(list){
				$log.debug('phenophaseList',list);
				if(list.length) {
					list.splice(0,0,{phenophase_id: -1, phenophase_name: 'All phenophases'});

					$scope.selection.phenophase = list.length ? list[0] : undefined;

				}

				$scope.phenophaseList = list;

			});



		}
	}

    $scope.$watch('selection.species',phenophaseListUpdate);
    $scope.$watch('selection.year',phenophaseListUpdate);

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
            .attr('style','font-size: 14px');

          // hide y axis
          chart.selectAll('g .y.axis path')
            .style('display','none');

		  svg.append('g').append('text').attr('dx',5)
			   .attr('dy',sizing.height + 61)
			   .attr('font-size', '11px')
			   .attr('font-style','italic')
			   .attr('text-anchor','right').text('USA National Phenology Network, www.usanpn.org');

          commonChartUpdates();
    },500);


    $scope.yAxisConfig = {
        labelOffset: 4,
        bandPadding: 0.5,
        fontSize: 14
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
