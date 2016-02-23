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