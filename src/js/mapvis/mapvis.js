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
    'npn-viz-tool.gridded',
    'ui.bootstrap',
    'rzModule',
])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-geo-layer
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Transfers any geojson features from the base map to the vis map based on GeoFilterArgs.
 * This is strictly for visual effect.  If such GeoFilterArgs are in play on then the filtered results
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
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-bounds-layer
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Transfers any rectangles from the base map to the vis map based on BoundsFilterArgs.
 * This is strictly for visual effect.  If such BoundsFilterArgs are in play on then the filtered results
 * will be used when placing in-situ data and as such markers will be similarly constrained.
 *
 * @scope
 */
.directive('mapVisBoundsLayer',['$log','$q','$timeout','uiGmapIsReady','FilterService','BoundsFilterArg',function($log,$q,$timeout,uiGmapIsReady,FilterService,BoundsFilterArg){
    return {
        restrict: 'E',
        template: '',
        scope: {},
        link: function($scope,$element,$attrs) {
            var boundsArgs = FilterService.getFilter().getBoundsArgs(),
                mapContainer = $element.parent().parent().find('.angular-google-map-container');
            if(boundsArgs.length) {
                $timeout(function(){
                    // this is a comlete hack but there appears to be no valid way to put features/polygons below a
                    // custom map layer.
                    $(mapContainer.children().first().children().first().children().first().children()[1]).css('z-index','99');
                },1000);
                uiGmapIsReady.promise(2).then(function(instances){
                    var baseMap = instances[0].map,
                        visMap = instances[1].map;
                    var rectangles = boundsArgs.map(function(arg){
                        return new google.maps.Rectangle(angular.extend({
                            clickable: false,
                            bounds: arg.arg.getBounds(),
                            map: visMap
                        },BoundsFilterArg.RECTANGLE_OPTIONS));
                    });
                    $log.debug('mapVisBoundsLayer.rectangles',rectangles);
                });
            }

        }
    };
}])
/**
 * @ngdoc service
 * @name npn-viz-tool.vis-map:MapVisMarkerService
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Holds SVG marker paths for shared use between tags and map markers.  Exposes basic
 * functionality for rendering marker paths in SVGs outside of the map itself (filter tags).
 *
 * @scope
 */
.service('MapVisMarkerService',['$log',function($log){
    var service = {
        /**
         * @ngdoc property
         * @propertyOf npn-viz-tool.vis-map:MapVisMarkerService
         * @name  PATHS
         * @description
         *
         * Array containing SVG paths (strings) for the map vis markers.
         */
        PATHS: [
            'M0 22 L22 22 L10 0 Z', // triangle
            'M0 22 L22 22 L22 0 L0 0 Z', // square
            'M4 22 L18 22 L22 10 L18 0 L4 0 L0 10 Z' // hexagon('ish)
        ],
        /**
         * @ngdoc method
         * @methodOf npn-viz-tool.vis-map:MapVisMarkerService
         * @name  getBaseIcon
         * @description
         *
         * Build a base marker object for a given icon path for use as a google map marker icon.
         *
         * @param {int} idx The marker index (0-2 otherwise the function does nothing).
         * @returns {object} A new base marker definition.
         */
        getBaseIcon: function(idx) {
            return {
                path: service.PATHS[idx],
                anchor: {x: 11, y: 11}, // markers are 22x22 px need to shift them up/left so they're centered over lat/lon
                scale: 1
            };
        },
        /**
         * @ngdoc method
         * @methodOf npn-viz-tool.vis-map:MapVisMarkerService
         * @name  renderMarkerToSvg
         * @description
         *
         * Render a marker path, by index to an SVG.
         *
         * @param {string} selector The d3/css selector that uniquely identifies the SVG to render the marker path to.
         * @param {int} idx The marker index (0-2 otherwise the function does nothing).
         * @param {stromg} fillColor The color to fill the icon will (default steelblue)
         */
        renderMarkerToSvg: function(selector,idx,fillColor) {
            if(idx < 0 || idx >= service.PATHS.length) {
                return; // invalid index, just ignore it.
            }
            fillColor = fillColor||'steelblue';
            var svg = d3.select(selector);
            svg.selectAll('path').remove();
            svg.attr('viewBox','0 0 22 22')
                .attr('width',16)
                .attr('height',16);
            svg.append('path')
                .attr('d',service.PATHS[idx])
                //.attr('transform','translate(-16,-32)')
                .attr('fill',fillColor);
        }
    };
    return service;
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-filter-tags
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Displays filter tags on top of the map visualization and supports removal of selections from the
 * filter.
 *
 * @scope
 * @param {Array} map-vis-filter Two way binding to an array containing the species/phenophase/year selections.
 */
.directive('mapVisFilterTags',['$log','$timeout','MapVisMarkerService',function($log,$timeout,MapVisMarkerService){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/filter-tags.html',
        scope: {
            mapVisFilter: '='
        },
        link: function($scope) {
            $scope.removeFromFilter = function(i) {
                $scope.mapVisFilter.splice(i,1);
            };
            $scope.$watchCollection('mapVisFilter',function(){
                $timeout(function(){
                    $scope.mapVisFilter.forEach(function(o,i){
                        MapVisMarkerService.renderMarkerToSvg('svg#map-vis-marker-'+i,i);
                    });
                });
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
.directive('mapVisInSituControl',['$log','$q','$http','$url','CacheService','FilterService',function($log,$q,$http,$url,CacheService,FilterService){
    var IMPLICIT_SPECIES_IDS = ['20','1198','35','36'],
        IMPLICIT_SPECIES_KEY = 'map-vis-insitu-implicit-species';
    function mergeImplicitAndUser(implicit_list,user_list) {
        var user_ids = user_list.map(function(species) {
            return species.species_id;
        });
        implicit_list.forEach(function(s) {
            if(user_ids.indexOf(s.species_id) === -1) {
                user_list.push(s);
            }
        });
        return user_list;
    }
    function getMergedSpeciesList(user_list) {
        var def = $q.defer(),
            implicit_list = CacheService.get(IMPLICIT_SPECIES_KEY);
        if(implicit_list) {
            def.resolve(mergeImplicitAndUser(implicit_list,user_list));
        } else {
            // unfortunately there's no web service to select multiple species by id
            // and the getSpeciesById.json service returns slightly different objects
            // so go get all species and filter out the list to those of interest.
            $http.get($url('/npn_portal/species/getSpeciesFilter.json')).then(function(response){
                implicit_list = response.data.filter(function(species){
                    return IMPLICIT_SPECIES_IDS.indexOf(species.species_id) !== -1;
                });
                $log.debug('filtered implicit list of species',implicit_list);
                CacheService.put(IMPLICIT_SPECIES_KEY,implicit_list,-1);
                def.resolve(mergeImplicitAndUser(implicit_list,user_list));
            });
        }
        return def.promise;
    }
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/in-situ-control.html',
        scope: {
            mapVisFilter: '=',
            layer: '=',
            mapVisPlot: '&'
        },
        link: function($scope) {
            var filter = FilterService.getFilter(),
                dateArg = filter.getDateArg(),
                hasGeographicArgs = filter.getGeographicArgs().length > 0; // bounds or selected layer features
            $scope.years = d3.range(dateArg.getStartYear(),dateArg.getEndYear()+1);
            $scope.selection = {
                year: $scope.years[0]
            };
            function checkCurrentYear() {
                var currentYear;
                if($scope.layer) {
                    $scope.disableControl = false;
                    if($scope.currentYearOnly = $scope.layer.currentYearOnly()) {
                        // forcibly select just the current year
                        currentYear = $scope.layer.extent.current.date.getFullYear();
                        // make sure that year is among those available, otherwise hide the control entirely
                        if($scope.years.indexOf(currentYear) === -1) {
                            $scope.disableControl = true;
                        } else {
                            $scope.selection.year = currentYear; // UI will disable the control
                        }
                    }
                }
            }
            $scope.$watch('layer',checkCurrentYear);
            $scope.$watch('layer.extent.current',checkCurrentYear);

            filter.getSpeciesList().then(function(list){
                $log.debug('speciesList',list);
                if(hasGeographicArgs) {
                    $log.debug('filter has geographic args, not adding implicit species.');
                    $scope.speciesList = list;
                    $scope.selection.species = list.length ? list[0] : undefined;
                } else {
                    $log.debug('filter has no geographic args merging in implicit species.');
                    getMergedSpeciesList(list).then(function(with_implicit){
                        $log.debug('merged',with_implicit);
                        $scope.speciesList = with_implicit;
                        $scope.selection.species = with_implicit.length ? with_implicit[0] : undefined;
                    });
                }
            });
            function phenophaseListUpdate() {
                var species = $scope.selection.species,
                    year = $scope.selection.year;
                if(species && year) {
                    $scope.phenophaseList = [];
                    FilterService.getFilter().getPhenophasesForSpecies(species.species_id,true/*get no matter what*/,[year]).then(function(list){
                        $log.debug('phenophaseList',list);
                        $scope.phenophaseList = list;
                        $scope.selection.phenophase = list.length ? list[0] : undefined;
                    });
                }
            }
            $scope.$watch('selection.species',phenophaseListUpdate);
            $scope.$watch('selection.year',phenophaseListUpdate);

            $scope.validSelection = function() {
                var s = $scope.selection;
                if(s.species && s.phenophase && s.year) {
                    return $scope.mapVisFilter.length < 3 &&
                            ($scope.mapVisFilter.length === 0 ||
                            !$scope.mapVisFilter.reduce(function(found,f){
                                return found||(s.species === f.species && s.phenophase === f.phenophase && s.year === f.year);
                            },false));
                }
                return false;
            };
            $scope.addSelectionToFilter = function() {
                $scope.mapVisFilter.push(angular.extend({},$scope.selection));
            };
        }
    };
}])
/**
 * @ngdoc directive
 * @restrict E
 * @name npn-viz-tool.vis-map:map-vis-marker-info-window
 * @module npn-viz-tool.vis-map
 * @description
 *
 * Contents of the InfoWindow when a user clicks on a plotted marker.
 */
.directive('mapVisMarkerInfoWindow',[function(){
    return {
        restrict: 'E',
        templateUrl: 'js/mapvis/marker-info-window.html'
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
.controller('MapVisCtrl',['$scope','$uibModalInstance','$filter','$log','$compile','$timeout','$q','$http','$url','uiGmapGoogleMapApi','uiGmapIsReady','RestrictedBoundsService','WmsService','ChartService','MapVisMarkerService','md5','GriddedInfoWindowHandler',
    function($scope,$uibModalInstance,$filter,$log,$compile,$timeout,$q,$http,$url,uiGmapGoogleMapApi,uiGmapIsReady,RestrictedBoundsService,WmsService,ChartService,MapVisMarkerService,md5,GriddedInfoWindowHandler){
        var api,
            map,
            griddedIwHandler,
            markerInfoWindow,
            markerMarkup = '<div><map-vis-marker-info-window></map-vis-marker-info-window></div>',
            boundsRestrictor = RestrictedBoundsService.getRestrictor('map_vis');
        $scope.modal = $uibModalInstance;
        $scope.wms_map = {
            center: { latitude: 48.35674, longitude: -122.39658 },
            zoom: 3,
            options: {
                disableDoubleClickZoom: true, // click on an arbitrary point gets gridded data so disable zoom (use controls).
                scrollwheel: true,
                streetViewControl: false,
                panControl: false,
                zoomControl: true,
                zoomControlOptions: {
                    style: google.maps.ZoomControlStyle.SMALL,
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                styles: [{
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{visibility:'off'}]
                },{
                    featureType: 'transit.station',
                    elementType: 'labels',
                    stylers: [{visibility:'off'}]
                },
                {
                    featureType: 'poi.park',
                    stylers: [{ visibility: 'off' }]
                },
                {
                    featureType: 'landscape',
                    stylers: [{ visibility: 'off' }]
                }]
            },

            events: {
                click: function(m,ename,args) {
                    var ev = args[0];
                    $log.debug('click',ev);
                    if(griddedIwHandler) {
                        griddedIwHandler.open(ev.latLng,$scope.selection.activeLayer,$scope.legend);
                    }
                },
                center_changed: boundsRestrictor.center_changed
            }
        };
        uiGmapGoogleMapApi.then(function(maps){
            api = maps;
            uiGmapIsReady.promise(2).then(function(instances){
                map = instances[1].map;
                griddedIwHandler = new GriddedInfoWindowHandler(map);
                WmsService.getLayers(map).then(function(layers){
                    $log.debug('layers',layers);
                    $scope.layers = layers;
                },function(){
                    $log.error('unable to get map layers?');
                });
            });
        });

        $scope.selection = {};
        $scope.results = {};
        function resetMarkers() {
            $scope.results.markerModels = {};
            $scope.results.markers = [];
        }
        resetMarkers();
        function noInfoWindows() {
            if(griddedIwHandler) {
                griddedIwHandler.close();
            }
            if(markerInfoWindow) {
                markerInfoWindow.close();
            }
        }
        $scope.$watch('selection.layerCategory',function(category) {
            $log.debug('layer category change ',category);
            if($scope.selection.activeLayer) {
                $log.debug('turning off layer ',$scope.selection.activeLayer.name);
                $scope.selection.activeLayer.off();
                delete $scope.selection.activeLayer;
                delete $scope.legend;
                noInfoWindows();
            }
        });
        $scope.$watch('selection.layer',function(layer) {
            if(!layer) {
                return;
            }
            noInfoWindows();
            delete $scope.markerModel;
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
                if(!$scope.selection.activeLayer.supportsData()) {
                    // moving to a layer that doesn't support data
                    // clear markers if any have been placed on the map.
                    resetMarkers();
                } else {
                    // the layer we're switching to supports data but will have a different
                    // color scale/labeling scheme, etc. so we need to update all the markers
                    // for the new layer.
                    $scope.results.markers = Object.keys($scope.results.markerModels).map(function(site_id){
                        return $scope.results.markerModels[site_id].restyle().marker();
                    });
                }
            });
        });
        $scope.$watch('selection.activeLayer.extent.current',function(v) {
            var layer,currentYear,updateSelections;
            if(layer = $scope.selection.activeLayer) {
                $log.debug('layer extent change ',layer.name,v);
                noInfoWindows();
                layer.bounce();
                if(layer.currentYearOnly()) {
                    currentYear = v.date.getFullYear();
                    updateSelections = $scope.speciesSelections.filter(function(ss){ return ss.year === currentYear; });
                    if(updateSelections.length !== $scope.speciesSelections.length) {
                        // something needs to change.... (keeping the original array reference)
                        $scope.speciesSelections.splice(0,$scope.speciesSelections.length);
                        //updateSelections.forEach($scope.speciesSelections.push);
                        updateSelections.forEach(function(us) { $scope.speciesSelections.push(us); });
                        // re-visualize
                        $scope.plotMarkers();
                    }
                }
            }
        });

        // This is an array of species/phenohpase selections which is passed to other directives
        // to manipulate.
        $scope.speciesSelections = [];
        $scope.$watchCollection('speciesSelections',function(newValue,oldValue) {
            $log.debug('speciesSelections',newValue,oldValue);
            if(oldValue && newValue && oldValue.length > newValue.length && $scope.results.markers.length) {
                // a filter has been removed and there are actually some markers on the map, re-visualize
                $scope.plotMarkers();
            }
        });

        $scope.markerEvents = {
            'click': function(m) {
                $log.debug('click',m);
                $scope.$apply(function(){
                    var sameAsPreviousMarker = ($scope.markerModel === $scope.results.markerModels[m.model.site_id]);
                    $scope.markerModel = $scope.results.markerModels[m.model.site_id];
                    if(!markerInfoWindow) {
                        markerInfoWindow = new api.InfoWindow({
                            maxWidth: 500,
                            content: ''
                        });
                    }
                    if(!sameAsPreviousMarker) {
                        markerInfoWindow.setContent('<i class="fa fa-circle-o-notch fa-spin"></i>');
                    }
                    markerInfoWindow.setPosition(m.position);
                    markerInfoWindow.open(m.map);
                });
            }
        };

        // this $watch correspondes to the marker click event the markerInfoWindow contents
        // aren't compiled until all the data necessary to render its contents arrive (station/gridded_data)
        // otherwise the results when showing the InfoWindow are inconsistent and data that arrives -after-
        // the window opens doesn't get properly bound into the DOM
        $scope.$watch('markerModel',function(model) {
            if(model) {
                var promises = [],station_def,gridded_def;
                $log.debug('mapVisMarkerInfoWindow.markerModel',model);
                if(!model.station) {
                    station_def = $q.defer();
                    promises.push(station_def.promise);
                    $http.get($url('/npn_portal/stations/getStationDetails.json'),{params:{ids: model.site_id}}).then(function(response){
                        var info = response.data;
                        model.station = info && info.length ? info[0] : undefined;
                        station_def.resolve();
                    });
                }
                gridded_def = $q.defer();
                promises.push(gridded_def.promise);
                delete model.gridded_legend_data;
                $scope.selection.activeLayer.getGriddedData(new google.maps.LatLng(model.latitude,model.longitude))
                    .then(function(tuples){
                        $log.debug('tuples',tuples);
                        var point = tuples && tuples.length ? tuples[0] : undefined;
                        if(typeof(point) === 'undefined' || point === -9999 || isNaN(point)) {
                            $log.debug('received undefined, -9999 or Nan ignoring');
                            gridded_def.resolve();
                            return;
                        }
                        var legend_data = $scope.legend.getPointData(point);
                        if(!legend_data) {
                            legend_data = {
                                label: $scope.legend.formatPointData(point),
                                color: '#ffffff'
                            };
                        }
                        model.gridded_legend_data = angular.extend({point: point},legend_data);
                        gridded_def.resolve();
                    },function() {
                        // TODO?
                        $log.error('unable to get gridded data.');
                        gridded_def.resolve();
                    });
                $q.all(promises).then(function(){
                    var compiled = $compile(markerMarkup)($scope);
                    $timeout(function(){
                        markerInfoWindow.setContent(compiled.html());
                        $timeout(function(){
                            $scope.speciesSelections.forEach(function(o,i){
                                if(model.data[i].record && model.data[i].legend_data) {
                                    MapVisMarkerService.renderMarkerToSvg('svg#map-vis-iw-marker-'+i,i,model.data[i].legend_data.color);
                                }
                            });
                        },250/*1st time the info-window shows up the svgs must not be there yet*/);
                    });
                });
            }
        });

        function GdMarkerModel() {
            var offscale_color = '#ffffff',
                marker = {
                    data: $scope.speciesSelections.map(function() { return {record: null}; }),
                    getSiteId: function() {
                        return marker.site_id;
                    },
                    restyle: function() {
                        // change border based on if there are more than one individual recorded for a marker.
                        marker.markerOpts.icon.strokeColor =  marker.data.reduce(function(sum,o){ return sum+(o.record ? 1 : 0); },0) > 1 ? '#00ff00' : '#204d74';
                        marker.markerOpts.title = marker.data.reduce(function(title,o,filter_index){
                            delete o.legend_data;
                            if(o.record) {
                                o.legend_data = o.record.legend_data = $scope.legend.getPointData(o.record.mean_first_yes_doy)||{
                                    color: offscale_color,
                                    label: 'off scale'
                                };
                                var s = $scope.speciesSelections[filter_index];
                                if(title !== '') {
                                    title += ', ';
                                }
                                title += s.year;
                                title += ': ';
                                // using the legend_data.label would not be the "exact" day but the day
                                // for the matching range in the scale
                                // i.e. 19 may result in January 15 rather than January 19 since 19 would fall
                                // in then Jan 15-Feb 1 range (so the label would January 15)
                                // formatPointData will give the exact day
                                title += $scope.legend.formatPointData(o.record.mean_first_yes_doy);
                            }
                            return title;
                        },'');
                        // update marker color
                        marker.markerOpts.icon.fillColor = marker.data[marker.filter_index].legend_data.color;
                        // update its key
                        marker.$markerKey = md5.createHash(JSON.stringify(marker));
                        return marker;
                    },
                    marker: function() { // returns a bare bones, simplified marker object
                        return {
                            $markerKey: marker.$markerKey,
                            site_id: marker.site_id,
                            latitude: marker.latitude,
                            longitude: marker.longitude,
                            markerOpts: marker.markerOpts
                        };
                    },
                    add: function(record,filter_index) {
                        marker.data[filter_index].record = record;
                        // first record dictates shape, z-index, etc.
                        if(!marker.markerOpts) {
                            marker.site_id = record.site_id;
                            marker.filter_index = filter_index;  // dictates the shape...
                            marker.latitude = record.latitude;
                            marker.longitude = record.longitude;
                            marker.markerOpts = {
                                zIndex: (365-record.first_yes_doy),
                                icon: angular.extend(MapVisMarkerService.getBaseIcon(filter_index),{
                                                    fillOpacity: 1.0,
                                                    strokeWeight: 1
                                                })
                            };
                        }
                        return marker.restyle();
                    }
                };
            return marker;
        }

        $scope.plotMarkers = function() {
            noInfoWindows();
            resetMarkers();
            $scope.working = true;
            // KISS - it may be more efficient to try to decide when to merge requests
            // together but this adds a lot of complexity/fragility so issuing
            // one request per combo in the filter.  this way there's no need to sift
            // through the results to decide which result applies to which marker type,
            // or deal with situations like gaps in years (one combo 2012 and another 2014
            // would make two requests better than one which would require tossing out 2013 data),
            // etc.

            // keep track of markers based on site so that if multiple species/individiuals exist for a given site
            // arrive markers can be updated more efficiently
            var site2marker = $scope.results.markerModels,
                summary_promises = $scope.speciesSelections.map(function(s,filter_index){
                    var def = $q.defer(),
                        params = {
                            request_src: 'npn-vis-map',
                            start_date: s.year+'-01-01',
                            end_date: s.year+'-12-31',
                            'species_id[0]': s.species.species_id,
                            'phenophase_id[0]': s.phenophase.phenophase_id
                        };
                    $log.debug('gathering summary data for ',s,params);
                    ChartService.getSiteLevelData(params,function(data){
                        $log.debug('site level data has arrived for ',s,data);
                        var new_markers = (data||[]).reduce(function(new_markers,record) {
                            // filter out means with -9999
                            if(record.mean_first_yes_doy === -9999) {
                                return new_markers;
                            }
                            // validate one site multiple species.
                            if(site2marker[record.site_id]) { // update an existing marker (e.g. multiple species at a given site)
                                site2marker[record.site_id].add(record,filter_index);
                            } else { // add a new marker
                                new_markers.push(site2marker[record.site_id] = (new GdMarkerModel()).add(record,filter_index));
                            }
                            return new_markers;
                        },[]);
                        // put the markers on the map as the data arrives appending any new markers
                        $log.debug('resulted in '+new_markers.length+' added markers.');
                        def.resolve();
                    });
                    return def.promise;
                });
            $q.all(summary_promises).then(function(){
                $log.debug('all summary data has arrived...');
                // post-pone adding markers until all data has arrived so things are styled properly.
                $scope.results.markers = Object.keys(site2marker).reduce(function(markers,site_id){
                    markers.push(site2marker[site_id].marker());
                    return markers;
                },[]);
                $scope.working = false;
            });
        };
}]);
