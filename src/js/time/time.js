angular.module('npn-viz-tool.vis-time',[
    'npn-viz-tool.vis',
    'npn-viz-tool.filter',
    'npn-viz-tool.filters',
    'npn-viz-tool.settings',
    'ui.bootstrap'
])
.controller('TimeSeriesVisCtrl',['$scope','$uibModalInstance','$log','$filter','$http','$url','$q','$timeout','layer','legend','latLng','ChartService',
function($scope,$uibModalInstance,$log,$filter,$http,$url,$q,$timeout,layer,legend,latLng,ChartService){
    // DEVELOPMENT - for development hard-coding lat/lng so that the proxy server can cache
    // the results and avoid waiting repeatedly for the web service to respond (8-10 seconds per)..
    /*latLng = {
        // somewhere in AZ
        lat: function() { return 32.84267363195431; },
        lng: function() { return -112.412109375; }
    };*/

    $scope.layer = layer;
    $scope.legend = legend;
    $scope.modal = $uibModalInstance;
    $scope.latLng = latLng;

    var lowerThresh = 0;
    var upperThresh = 0;
    var doubleSine = false;
    var timeSeriesUrl = $url('/npn_portal/stations/getTimeSeries.json');
    // figure out how many days forward we can request relative to selected date (max of 6)
    var extentDate = new Date(layer.extent.current.date);
    var diffDays = Math.ceil((extentDate.getTime() - new Date().getTime())/(24*60*60*1000));
    var selectedExtentDaysBeyondToday = 0;
    if (diffDays > 0) {
        selectedExtentDaysBeyondToday = diffDays;
    }
    var numAvailForecastDays = 6 - selectedExtentDaysBeyondToday;

    extentDate.setDate(extentDate.getDate() + numAvailForecastDays);
    var timeSeriesStart = extentDate.getFullYear() + '-01-01';
    var timeSeriesEnd = extentDate.toISOString().split('T')[0];
    var nodeServer = 'https://data.usanpn.org/geoservices';
    if(location.hostname.includes('local') || location.hostname.includes('dev')) {
        nodeServer = 'https://data-dev.usanpn.org/geoservices';
    }
    if(layer.pest === 'Asian Longhorned Beetle' || layer.pest === 'Gypsy Moth' || layer.pest === 'Bronze Birch Borer' || layer.pest === 'Emerald Ash Borer' || layer.pest === 'Lilac Borer' || layer.pest === 'Magnolia Scale') {
        doubleSine = true;
        lowerThresh = 50;
        upperThresh = 86;
        if(layer.pest === 'Gypsy Moth') {
            lowerThresh = 37.4;
            upperThresh = 104;
        }
        if(layer.pest === 'Bronze Birch Borer' || layer.pest === 'Emerald Ash Borer' || layer.pest === 'Lilac Borer' || layer.pest === 'Magnolia Scale') {
            lowerThresh = 50;
            upperThresh = 150;
        }
        timeSeriesUrl = nodeServer + '/v1/agdd/double-sine/pointTimeSeries';
    }
    if(layer.pest == 'Eastern Tent Caterpillar' || layer.pest == 'Pine Needle Scale' || layer.pest == 'Bagworm') {
        timeSeriesStart = extentDate.getFullYear() + '-03-01';
        lowerThresh = 50;
        timeSeriesUrl = nodeServer + '/v1/agdd/simple/pointTimeSeries';
    }

    var degF = '\u00B0' + 'F',
        dateFmt = 'yyyy-MM-dd',
        date = $filter('date'),
        number = $filter('number'),
        this_year = (new Date()).getFullYear(),
        defaultThreshold = function() {
            if(layer.pest === 'Hemlock Woolly Adelgid') {
                return 1000;
            } else if(layer.pest === 'Emerald Ash Borer') {
                return 450;
            } else if(layer.pest === 'Winter Moth') {
                return 20;
            } else if(layer.pest === 'Lilac Borer') {
                return 500;
            } else if(layer.pest === 'Apple Maggot') {
                return 900;
            } else if(layer.pest === 'Bronze Birch Borer') {
                return 450;
            } else if(layer.pest === 'Pine Needle Scale') {
                return 298;
            } else if(layer.pest === 'Eastern Tent Caterpillar') {
                return 90;
            } else if(layer.pest === 'Gypsy Moth') {
                return 571;
            } else if(layer.pest === 'Asian Longhorned Beetle') {
                return 690;
            } else if(layer.pest === 'Bagworm') {
                return 600;
            } else if(layer.pest === 'Magnolia Scale') {
                return 1938;
            } else {
                return 1000;
            }
        },
        defaultDoy = function() {
            var selectedDate = new Date(layer.extent.current.date.getTime());
            if(selectedDate.getMonth() > 10 || !layer.pest) {
                return 365;
            }
            //preset default date to one month in future from selected date
            selectedDate.setMonth(selectedDate.getMonth()+1);
            var start = new Date(selectedDate.getFullYear(), 0, 0);
            var diff = (selectedDate - start) + ((start.getTimezoneOffset() - selectedDate.getTimezoneOffset()) * 60 * 1000);
            var oneDay = 1000 * 60 * 60 * 24;
            var doy = Math.floor(diff / oneDay);
            return doy;
        },
        extent_year = layer.extent.current && layer.extent.current.date ? layer.extent.current.date.getFullYear() : this_year,
        start = (function(){
            var d = new Date();
            d.setFullYear(extent_year);
            d.setMonth(0);
            d.setDate(1);
            return d;
        })(),
        forecast = extent_year === this_year,
        end = (function(){
            var d = forecast ?
                // use the latest date the layer supports
                new Date(layer.extent.values[layer.extent.values.length-1].date.getTime()) :
                new Date();
            if(!forecast) {
                // if this year end today (no more data)
                // if previous year then get the full year's data
                d.setFullYear(extent_year);
                d.setMonth(11);
                d.setDate(31);
            }
            return d;
        })(),
        avg_params = {
            latitude: latLng.lat(),
            longitude: latLng.lng()
        },
        params = {
            layer : layer.name,
            start_date: date(start,dateFmt),
            end_date: date(end,dateFmt),
            latitude: latLng.lat(),
            longitude: latLng.lng(),
            climateProvider: 'NCEP',
            temperatureUnit: 'fahrenheit',
            base: lowerThresh,
            lowerThreshold: lowerThresh,
            upperThreshold: upperThresh,
            timeSeriesUrl: timeSeriesUrl,
            startDate: timeSeriesStart,
            endDate: timeSeriesEnd
        };
    avg_params.layer = (params.layer === 'gdd:agdd') ? 'gdd:30yr_avg_agdd' : 'gdd:30yr_avg_agdd_50f';
    var base_temp = (params.layer === 'gdd:agdd') ? 32 : 50;
    if(layer.pest === 'Gypsy Moth') {
        base_temp = 37.4;
    }

    var show30YearAvg = true;
    if(layer.pest === 'Gypsy Moth' || layer.pest === 'Asian Longhorned Beetle' || layer.pest === 'Pine Needle Scale' || layer.pest === 'Bagworm' || layer.pest === 'Eastern Tent Caterpillar' || layer.pest === 'Emerald Ash Borer' || layer.pest === 'Bronze Birch Borer' || layer.pest === 'Lilac Borer' || layer.pest === 'Magnolia Scale') {
        show30YearAvg = false;
    }

    $log.debug('TimeSeries.avg_params',avg_params);
    $log.debug('TimeSeries.params',params);

    var sizing = ChartService.getSizeInfo({top: 80,left: 80}),
        chart,thresholdLine,
        d3_date_fmt = d3.time.format('%m/%d'),
        date_fmt = function(d){
            var time = ((d-1)*ChartService.ONE_DAY_MILLIS)+start.getTime(),
                date = new Date(time);
            return d3_date_fmt(date);
        },
        d3_short_date_fmt = d3.time.format('%b %-d'),
        short_date_fmt = function(d) {
            var time = ((d-1)*ChartService.ONE_DAY_MILLIS)+start.getTime(),
                date = new Date(time);
            return d3_short_date_fmt(date);
        },
        x = d3.scale.linear().range([0,sizing.width]).domain([1,365]),
        xAxis = d3.svg.axis().scale(x).orient('bottom').tickFormat(date_fmt),
        yMax = 20000, // the max possible, initially
        y = d3.scale.linear().range([sizing.height,0]).domain([0,yMax]),
        yAxis = d3.svg.axis().scale(y).orient('left'),
        dataFunc = function(d) { 
            return d.agdd != null ? d.agdd : d.point_value;
            //return d.point_value; 
        },
        idFunc = function(d) { return d.doy; }, // id is the doy which is the index.
        line = d3.svg.line() // TODO remove if decide to not use
            .x(function(d,i){ return x(d.doy); })
            .y(function(d,i){ 
                return d.agdd != null ? y(d.agdd) : y(d.point_value);
                //return y(d.point_value); 
            }).interpolate('basis'),
        data = {}; // keys: selected,average[,previous];

    function addData(key,obj) {
        data[key] = obj;
        data[key].doyMap = data[key].data.reduce(function(map,d){
            map[idFunc(d)] = dataFunc(d);
            return map;
        },{});
    }

    $scope.selection = {
        lastYearValid: extent_year > 2016, // time series data starts in 2016
        showLastYear: false,
        threshold: {
            value: defaultThreshold(),
            options: {
                floor: 0,
                ceil: yMax,
                step: 10,
                translate: function(n) {
                    return number(n,0)+degF;
                }
            }
        },
        doys: {
            value: defaultDoy(),
            options: {
                floor: 1,
                ceil: 365,
                step: 1,
                translate: function(n) {
                    return short_date_fmt(n)+' ('+n+')';
                }
            }
        }
    };

    function commonChartUpdates() {
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

        var fontSize = '16px';

        chart.selectAll('g .x.axis text')
            .style('font-size', fontSize);

        chart.selectAll('g .y.axis text')
            .style('font-size', fontSize);
    }

    function updateLegend() {
        chart.select('.legend').remove();
        var legend = chart.append('g')
              .attr('class','legend')
              .attr('transform','translate(30,-45)') // relative to the chart, not the svg
              .style('font-size','1em'),
            rect = legend.append('rect')
                .style('fill','white')
                .style('stroke','black')
                .style('opacity','0.8')
                .attr('width',130)
                .attr('height',60),
            fontSize = 14,
            r = 5,
            vpad = 4,
            keys = ['average','selected','forecast','previous'], //Object.keys(data), hard coding to control order
            plotCnt = keys.reduce(function(cnt,key,i) {
                var row;
                if(data[key] && data[key].plotted && (data[key].filtered||data[key].data).length) {
                    row = legend.append('g')
                        .attr('class','legend-item '+key)
                        .attr('transform','translate(10,'+(((cnt+1)*fontSize)+(cnt*vpad))+')');
                    row.append('circle')
                        .attr('r',r)
                        .attr('fill',data[key].color);
                    row.append('text')
                        .style('font-size', fontSize+'px')
                        .attr('x',(2*r))
                        .attr('y',(r/2))
                        .text(data[key].year||'30-year Average');
                    cnt++;
                }
                return cnt;
            },0);
            if(plotCnt < 3) {
                rect.attr('height',45);
            } else if (plotCnt > 3) {
                rect.attr('height',80);
            }
    }

    function removeLine(key) {
        if(data[key]) {
            chart.selectAll('path.gdd.'+key).remove();
            delete data[key].plotted;
            updateLegend();
        }
    }

    function addLine(key) {
        if(data[key]) {
            chart.append('path')
                .attr('class','gdd '+key)
                .attr('fill','none')
                .attr('stroke',data[key].color)
                .attr('stroke-linejoin','round')
                .attr('stroke-linecap','round')
                .attr('stroke-width',1.5)
                .attr('d',line(data[key].filtered||data[key].data));
            data[key].plotted = true;
            updateLegend();
        }
    }
    function updateThreshold() {
        var yCoord = y($scope.selection.threshold.value);
        thresholdLine.attr('y1',yCoord).attr('y2',yCoord);
    }

    function updateAxes() {
        var lineKeys = Object.keys(data),maxes;
        if(lineKeys.length) {
            // calculate/re-calculate the y-axis domain so that the data fits nicely
            maxes = lineKeys.reduce(function(arr,key){
                arr.push(d3.max((data[key].filtered||data[key].data),dataFunc));
                return arr;
            },[]);
            $scope.selection.threshold.options.ceil = Math.round(yMax = d3.max(maxes));
            if($scope.selection.threshold.value > $scope.selection.threshold.options.ceil) {
                $scope.selection.threshold.value = $scope.selection.threshold.options.ceil;
            }
            yMax = yMax*1.05;
            yAxis.scale(y.domain([0,yMax]));
            updateThreshold();
            // updathe x-axis as necessary
            xAxis.scale(x.domain([1,$scope.selection.doys.value]));
            // if this happens we need to re-draw all lines that have been plotted
            // because the domain of our axis just changed
            lineKeys.forEach(function(key) {
                if(data[key].plotted) {
                    removeLine(key);
                    addLine(key);
                }
            });

        }

        chart.selectAll('g .axis').remove();
        chart.append('g')
            .attr('class', 'y axis')
            .call(yAxis)
            .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', '0')
            .attr('dy','-3.75em')
            .attr('x',-1*(sizing.height/2)) // looks odd but to move in the Y we need to change X because of transform
            .style('text-anchor', 'middle')
            .text('Accumulated Growing Degree Days');

        chart.append('g')
            .attr('class', 'x axis')
            .attr('transform', 'translate(0,' + sizing.height + ')')
            .call(xAxis)
            .append('text')
            .attr('y','0')
            .attr('dy','2.5em')
            .attr('x',(sizing.width/2))
            .style('text-anchor', 'middle')
            .text('Date');
        commonChartUpdates();
    }

    // this initializes the empty visualization and gets the ball rolling
    // it is within a timeout so that the HTML gets rendered and we can grab
    // the nested chart element (o/w it doesn't exist yet).
    $timeout(function(){
        $scope.$broadcast('rzSliderForceRender');
        var svg = d3.select('.chart')
            .attr('width', sizing.width + sizing.margin.left + sizing.margin.right)
            .attr('height', sizing.height + sizing.margin.top + sizing.margin.bottom);
        svg.append('g').append('rect').attr('width','100%').attr('height','100%').attr('fill','#fff');
        chart = svg.append('g')
            .attr('transform', 'translate(' + sizing.margin.left + ',' + sizing.margin.top + ')');

        var chart_title = chart.append('g')
             .attr('class','chart-title');
        chart_title.append('text')
            .attr('y', '0')
            .attr('dy','-3em')
            .attr('x', (sizing.width/2))
            .style('text-anchor','middle')
            .style('font-size','18px').text('Accumulated Growing Degree Days');
        chart_title.append('text')
            .attr('y', '0')
            .attr('dy','-1.8em')
            .attr('x', (sizing.width/2))
            .style('text-anchor','middle')
            .style('font-size','18px').text('(Lat: '+number(latLng.lat())+', Lon: '+number(latLng.lng())+') '+base_temp+degF+' Base Temp');

        updateAxes();

        svg.append('g').append('text').attr('dx',5)
            .attr('dy',sizing.height + 136)
            .attr('font-size', '11px')
            .attr('font-style','italic')
            .attr('text-anchor','right').text('USA National Phenology Network, www.usanpn.org');

        thresholdLine = chart.append('line')
            .attr('class','threshold')
            .attr('fill','none')
            .attr('stroke','green')
            .attr('stroke-width',1)
            .attr('x1',x(1))
            .attr('y1',y(yMax))
            .attr('x2',x(365))
            .attr('y2',y(yMax));

        var hover = svg.append('g')
            .attr('transform', 'translate(' + sizing.margin.left + ',' + sizing.margin.top + ')')
            .style('display','none');
        var hoverLine = hover.append('line')
                .attr('class','focus')
                .attr('fill','none')
                .attr('stroke','green')
                .attr('stroke-width',1)
                .attr('x1',x(1))
                .attr('y1',y(0))
                .attr('x2',x(1))
                .attr('y2',y(yMax));
        var hoverInfoDy = '1.2em',
            hoverInfoX = 15,
            hoverInfo = hover.append('text')
                .attr('class','gdd-info')
                .attr('font-size',16)
                .attr('y',40),
            doyInfo = hoverInfo.append('tspan').attr('dy','1em').attr('x',hoverInfoX),
            doyLabel = doyInfo.append('tspan').attr('class','gdd-label').text('DOY: '),
            doyValue = doyInfo.append('tspan').attr('class','gdd-value'),
            infoKeys = ['average','previous','selected','forecast'],
            infos = infoKeys.reduce(function(map,key){
                map[key] = hoverInfo.append('tspan').attr('dy',hoverInfoDy).attr('x',hoverInfoX);
                return map;
            },{}),
            infoLabels = infoKeys.reduce(function(map,key){
                map[key] = infos[key].append('tspan').attr('class','gdd-label '+key);
                return map;
            },{}),
            infoValues = infoKeys.reduce(function(map,key){
                map[key] = infos[key].append('tspan').attr('class','gdd-value');
                return map;
            },{}),
            infoDiffs = ['previous','forecast','selected'].reduce(function(map,key){
                map[key] = infos[key].append('tspan').attr('class','gdd-diff');
                return map;
            },{});
        function focusOff() {
            hover.style('display','none');
        }
        function focusOn() {
            hover.style('display',null);
        }
        function updateFocus() {
            var coords = d3.mouse(this),
                xCoord = coords[0],
                yCoord = coords[1],
                doy = Math.round(x.invert(xCoord)),
                lineKeys = Object.keys(data),
                temps;
            hoverLine.attr('transform','translate('+xCoord+')');
            temps = lineKeys.reduce(function(map,key) {
                var temp;
                if(data[key].plotted) {
                    // get the value for doy
                    temp = data[key].doyMap[doy];
                    if(typeof(temp) !== 'undefined') {
                        map[key] = {
                            year: data[key].year,
                            gdd: temp
                        };
                        if(!data[key].focus) {
                            // create a focus ring for this line
                            data[key].focus = hover.append('circle')
                                .attr('r',4.5)
                                .attr('fill','none')
                                .attr('stroke','steelblue');
                        }
                        data[key].focus
                            .style('display',null)
                            .attr('transform','translate('+xCoord+','+y(temp)+')');
                    } else if (data[key].focus) {
                        // invalid doy, hide focus ring
                        data[key].focus.style('display','none');
                    }
                }
                return map;
            },{});
            $log.debug('temps for doy '+doy,temps);
            doyValue.text(doy+' ('+date_fmt(doy)+')');
            Object.keys(infos).forEach(function(key) {
                var temp,diff,avgDoy,diffDoy,text,i;
                if(temps[key]) {
                    infos[key].style('display',null);
                    infoLabels[key].text((temps[key].year||'30-year Average')+': ');
                    temp = temps[key].gdd;
                    infoValues[key].text(number(temp,0)+' GDD');
                    if(infoDiffs[key] && temps.average != null) {
                        diff = temp-temps.average.gdd;
                        text = ' ('+(diff > 0 ? '+' : '')+number(diff,0)+' GDD';
                        // on what day did the current temperature happen
                        for(i = 0; i < data.average.data.length; i++) {
                            if(dataFunc(data.average.data[i]) > temp) {
                                avgDoy = idFunc(data.average.data[i]);
                                break;
                            }
                        }
                        // this can happen when the year being compared
                        // is now hotter than the average has ever been
                        // i.e. late in the year
                        if(avgDoy > 0 && avgDoy < 366) {
                            diffDoy = (avgDoy-doy);
                            text +='/'+(diffDoy > 0 ?'+' : '')+diffDoy+' days';
                        }

                        text += ')';
                        infoDiffs[key]
                        .attr('class','gdd-diff '+(diff > 0 ? 'above' : 'below'))
                        .text(text);
                    }
                } else {
                    infos[key].style('display','none');
                }
            });

        }
        svg.append('rect')
            .attr('class','overlay')
            .attr('transform', 'translate(' + sizing.margin.left + ',' + sizing.margin.top + ')')
            .style('fill','none')
            .style('pointer-events','all')
            .attr('x',0)
            .attr('y',0)
            .attr('width',x(365))
            .attr('height',y(0))
            .on('mouseover',focusOn)
            .on('mouseout',focusOff)
            .on('mousemove',updateFocus);

        commonChartUpdates();
        visualize();
    });

    function doyTrim() {
        var value = $scope.selection.doys.value;
        if(value === 365) {
            Object.keys(data).forEach(function(key){
                delete data[key].filtered;
            });
        } else {
            Object.keys(data).forEach(function(key) {
                data[key].filtered = data[key].data.filter(function(d) {
                    return idFunc(d) <= value;
                });
            });
        }
        updateAxes();
    }
    var $doyTrimTimer;
    $scope.$watch('selection.doys.value',function(value,oldValue) {
        if(value !== oldValue) {
            if($doyTrimTimer) {
                $timeout.cancel($doyTrimTimer);
            }
            $doyTrimTimer = $timeout(doyTrim,500);
        }
    });

    // only setup a watch on selection.showLastYear if it can even happen
    if($scope.selection.lastYearValid) {
        $scope.$watch('selection.showLastYear',function(show) {
            if(show && (!data.previous)) {
                // no data for last year yet, go get it
                $scope.working = true;
                var lastStart = new Date(start.getTime()),
                    lastEnd = new Date(start.getTime()),
                    previous_params;
                lastStart.setFullYear(lastStart.getFullYear()-1);
                lastEnd.setFullYear(lastStart.getFullYear());
                lastEnd.setMonth(11);
                lastEnd.setDate(31);
                var tempStart = params.startDate.split('-');
                var tempEnd = params.endDate.split('-');
                var lastYearStartDateString = tempStart[0] - 1 + '-' + tempStart[1] + '-' + tempStart[2];
                var lastYearEndDateString = tempEnd[0] - 1 + '-12-31';
                previous_params = angular.extend({},params,{start_date:date(lastStart,dateFmt),end_date:date(lastEnd,dateFmt),startDate:lastYearStartDateString,endDate:lastYearEndDateString});
                console.log(JSON.stringify(previous_params));
                $log.debug('previous_params',previous_params);
                $http.get(timeSeriesUrl,{
                    params:previous_params
                }).then(function(response) {
                    if(response.data.timeSeries != null) {
                        response.data = response.data.timeSeries;
                    }
                    addData('previous',{
                        year: lastStart.getFullYear(),
                        color: 'orange',
                        data: response.data
                    });
                    doyTrim();
                    updateAxes();
                    commonChartUpdates();
                    addLine('previous');
                    delete $scope.working;
                });
            } else if (data.previous) {
                // toggle the line
                if(show) {
                    addLine('previous');
                } else {
                    removeLine('previous');
                }
            }
        });
    }

    // this function, called from the $timeout above, gets the initial data
    // and draws the selected/average lines on the chart.
    function visualize() {
        // setup watch for slider
        $scope.$watch('selection.threshold.value',updateThreshold);
        $scope.working = true;
        $q.all({
            average: $http.get($url('/npn_portal/stations/getTimeSeries.json'),{
                params:avg_params
            }),
            selected: $http.get(timeSeriesUrl,{
                params:params
            })
        }).then(function(results){
            if(results.selected.data.timeSeries != null) {
                results.selected.data = results.selected.data.timeSeries;
            }
            if(forecast) {
                // need to separate out <=today and >today
                // this is kind of quick and dirty for doy
                var todayString = date(new Date(),'yyyy-MM-dd'),
                    processed = results.selected.data.reduce(function(map,d){
                        if(!map.forecast) {
                            map.selected.push(d);
                            if(d.date === todayString) {
                                // include the last day of the selected range
                                // on the forecast so the two connect on the graph
                                map.forecast = [d]; // forecast data starts here
                            }
                        } else {
                            map.forecast.push(d);
                        }
                        return map;
                    },{
                        selected: []
                    });
                    if(!processed.forecast) {
                        processed.forecast = [];
                    }
                addData('selected',{
                    year: start.getFullYear(),
                    color: 'blue',
                    data: processed.selected
                });
                addData('forecast',{
                    year: start.getFullYear()+' forecast',
                    color: 'red',
                    data: processed.forecast
                });
            } else {
                addData('selected',{
                    year: start.getFullYear(),
                    color: 'blue',
                    data: results.selected.data
                });
            }
            if(show30YearAvg) {
                addData('average',{
                    color: 'black',
                    data: results.average.data
                });
            }
            
            $log.debug('draw',data);

            doyTrim();
            updateAxes();

            if(show30YearAvg) {
                addLine('average');
            }
            addLine('selected');
            if(forecast) {
                addLine('forecast');
            }
            commonChartUpdates();
            delete $scope.working;

        });
    }
}])
.provider('$timeSeriesVis',[function(){
    this.$get = ['ChartService',function(ChartService){
        return function(layer,legend,latLng) {
            ChartService.openVisualization({
                title: 'Daily Accumulation',
                noFilterRequired: true,
                template: 'js/time/time.html',
                controller: 'TimeSeriesVisCtrl'
            },{
                layer: function() { return layer; },
                legend: function() { return legend; },
                latLng: function() { return latLng; }
            });
        };
    }];
}]);
