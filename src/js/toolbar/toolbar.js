angular.module('npn-viz-tool.toolbar',[
])
.directive('toolbar', ['$rootScope',function($rootScope) {
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