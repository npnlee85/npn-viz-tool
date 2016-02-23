NG_DOCS={
  "sections": {
    "api": "API Documentation"
  },
  "pages": [
    {
      "section": "api",
      "id": "index",
      "shortName": "NPN Visualization Tool",
      "type": "overview",
      "moduleName": "NPN Visualization Tool",
      "shortDescription": "This documentation attempts to capture at a high level the components of the NPN visualization tool",
      "keywords": "api attempts capture components documentation high level npn overview reference tool visualization"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.bounds",
      "shortName": "npn-viz-tool.bounds",
      "type": "overview",
      "moduleName": "npn-viz-tool.bounds",
      "shortDescription": "Bounds related functionality.",
      "keywords": "api bounds functionality npn-viz-tool overview"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.bounds:bounds-manager",
      "shortName": "bounds-manager",
      "type": "directive",
      "moduleName": "npn-viz-tool.bounds",
      "shortDescription": "Handles the ability for users to draw rectangles on the main map and have it affect the underlying filter.",
      "keywords": "ability affect api bounds directive draw filter handles main map npn-viz-tool rectangles underlying users"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.bounds:RestrictedBoundsService",
      "shortName": "RestrictedBoundsService",
      "type": "service",
      "moduleName": "npn-viz-tool.bounds",
      "shortDescription": "Provides objects that can be used to handle Google Map &#39;center_changed&#39; events to keep the user",
      "keywords": "$scope add api app argument associated boundaries bounds boundsrestrictor center_changed center_changned changed defined events fetch getrestrictor google handle identifiy initial instance key latlngbounds main_map map maps method movements moving npn-viz-tool object objects opaque panning partially query recenter rectangle restrict restricted restrictedboundsservice restrictor service set setbounds showing time unique user var white"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map",
      "shortName": "npn-viz-tool.vis-map",
      "type": "overview",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Logic for gridded data map visualization.",
      "keywords": "api data gridded logic map npn-viz-tool overview vis-map visualization"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services",
      "shortName": "npn-viz-tool.vis-map-services",
      "type": "overview",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Service support for gridded data map visualization.",
      "keywords": "api data gridded map npn-viz-tool overview service support vis-map-services visualization"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:extentDates",
      "shortName": "extentDates",
      "type": "filter",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Filters an array of extent dates relative to days.",
      "keywords": "$filter api array dates days extent extentdates filter filters npn-viz-tool relative today undefined vis-map-services year"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:legendAgddAnomaly",
      "shortName": "legendAgddAnomaly",
      "type": "filter",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Formats legend numbers for agdd anomaly layers.",
      "keywords": "agdd anomaly api filter formats layers legend npn-viz-tool numbers vis-map-services"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:legendDegrees",
      "shortName": "legendDegrees",
      "type": "filter",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Formats legend numbers in degrees, assumes F if no unit supplied.",
      "keywords": "$filter api assumes degrees filter formats legend legenddegrees npn-viz-tool numbers supplied unit vis-map-services"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:legendDoy",
      "shortName": "legendDoy",
      "type": "filter",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Simplified version of thirtyYearAvgDayOfYear that simply takes a number day of year",
      "keywords": "$filter api argument current day days defaults defines doy equates filter format formatted inconsistent jan legend legenddoy mmm npn-viz-tool number oposed optional regard returns scales second simplified simply takes third thirtyyearavgdayofyear true undefined version vis-map-services year"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:legendSixAnomaly",
      "shortName": "legendSixAnomaly",
      "type": "filter",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Formats legend numbers for spring index anomaly layers",
      "keywords": "anomaly api filter formats layers legend npn-viz-tool numbers spring vis-map-services"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:thirtyYearAvgDayOfYear",
      "shortName": "thirtyYearAvgDayOfYear",
      "type": "filter",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Filter that translates a doy value (number) into date text of &#39;Month day&#39;",
      "keywords": "api avg base based day days doy filter instance layers month npn-viz-tool text translates vis-map-services year yr"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:WcsService",
      "shortName": "WcsService",
      "type": "service",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Interacts with the NPN geoserver WCS instance to supply underlying gridded data.  Loading of this service",
      "keywords": "activelayer api array associated class data extends fetch geoserver getgriddeddata google grid gridded gridsize instance interacts larger latlng layer loading location map maps method npn npn-viz-tool number numbers point promise protypes rejected resolved returned service side specific supply underlying vis-map-services wcs wcsservice"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map-services:WmsService",
      "shortName": "WmsService",
      "type": "service",
      "moduleName": "npn-viz-tool.vis-map-services",
      "shortDescription": "Interacts with the NPN geoserver WMS instance to supply map layer data.",
      "keywords": "addition agdd angular api applied args arguments array associated base capabilities categories categorized category code current data define defined defines displaying document driven ease eventually exposed exposes extent extent_values_filter extentdates extention fetched filter format formatting gdd geoserver getlayers gridded individual inherit instance interacts involved json layer layers legend legend_label_filter legenddegrees level list machine map maps method minimum names necessaary npn npn-viz-tool numbers object objects optional organization points progress promise properties property re-organized rejected report reported resolved retrived service single specifies strings subset supply supported title today ui valid values vis-map-services visualization wcs whilch wms year"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-date-control",
      "shortName": "map-vis-date-control",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Control for date extents.",
      "keywords": "api control currently directive extents layer map npn-viz-tool selected vis-map"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-doy-control",
      "shortName": "map-vis-doy-control",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "control for day of year extents.",
      "keywords": "api control currently day directive extents layer map npn-viz-tool selected vis-map year"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-geo-layer",
      "shortName": "map-vis-geo-layer",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Transfers any geojson features from the base map to the vis map based on GeoFilterArgs.",
      "keywords": "api args base based constrained data directive features filtered geofilter geofilterargs geojson in-situ map markers npn-viz-tool placing play strictly transfers vis vis-map visual"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-in-situ-control",
      "shortName": "map-vis-in-situ-control",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Directive to control addition of in-situ data to the visualization map.",
      "keywords": "addition api control currently data directive in-situ layer map npn-viz-tool selected vis-map visualization"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-layer-control",
      "shortName": "map-vis-layer-control",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Directive to control categorized selection of WMS layers.  This directive",
      "keywords": "api categorized control directive layers npn-viz-tool parent scope selection shares vis-map wms"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-legend",
      "shortName": "map-vis-legend",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Directive to dynamically display an interactive legend for a seleted map layer.",
      "keywords": "api currently directive display dynamically interactive layer legend map npn-viz-tool selected seleted vis-map"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-opacity-slider",
      "shortName": "map-vis-opacity-slider",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Dynamically controls the opacity of map tiles.",
      "keywords": "api controls currently directive dynamically layer map npn-viz-tool opacity selected tiles vis-map"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:map-vis-year-control",
      "shortName": "map-vis-year-control",
      "type": "directive",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Control for year extents.",
      "keywords": "api control currently directive extents layer map npn-viz-tool selected vis-map year"
    },
    {
      "section": "api",
      "id": "npn-viz-tool.vis-map:MapVisCtrl",
      "shortName": "MapVisCtrl",
      "type": "controller",
      "moduleName": "npn-viz-tool.vis-map",
      "shortDescription": "Controller for the gridded data map visualization dialog.",
      "keywords": "api controller data dialog gridded map npn-viz-tool vis-map visualization"
    }
  ],
  "apis": {
    "api": true
  },
  "html5Mode": false,
  "editExample": true,
  "startPage": "/api",
  "scripts": [
    "angular.min.js"
  ]
};