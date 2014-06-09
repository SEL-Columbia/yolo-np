(function($){


Map = {
    map: null,
    buildMode: false,
    points: []
};

Map.init = function(){
    // Initialize map
    var self = this;
    self.map = L.map('map', {zoomAnimation: false, inertia: false})
        .setView([13.61105531, -5.77599353], 16);

    L.tileLayer('http://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        subdomains: '0123',
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(self.map);

    self.map.doubleClickZoom.disable(); 
    self.map.on('dblclick', self.dblclick);
};

Map.dblclick = function(e){
    var self = Map;
    var point = e.latlng;
    var prev = self.points[self.points.length - 1];
    self.points.push(point);

    L.circleMarker(point, {radius: 7, fillOpacity: 1})
        .addTo(self.map);
    if (prev){
        L.polyline([prev, point], {color: 'red'})
            .addTo(self.map);
    }
    self.drawPowerPoles();
};

Map.drawPowerPoles = function(){
    for (var i = 0, pointA; pointA = this.points[i]; i++){
        var pointB = this.points[i + 1];
        if (pointB){
            var poles = this.generatePoints(pointA, pointB);
            for (var j = 0, point; point = poles[j]; j++){
                L.circleMarker(point, {radius: 5, color: 'teal', fillOpacity: 1})
                    .addTo(this.map);
            }
        }
    };
};

Map.generatePoints = function(pointA, pointB, interval){
    // Returns a list of points between A and B at intervals of X meters
    var self = this;
    interval = interval || 100;
    var points = [];
    var dist = self.distBetweenPoints(pointA.lat, pointA.lng, pointB.lat, pointB.lng) * 1000;
    var nSplits = Math.floor(dist / interval);
    var splitLat = (pointB.lat - pointA.lat) / nSplits;
    var splitLon = (pointB.lng - pointA.lng) / nSplits;
    for (var i=0; i < nSplits; i++){
        points.push([i * splitLat + pointA.lat, i * splitLon + pointA.lng]);
    }
    return points;
};

Map.distBetweenPoints = function(latA, lonA, latB, lonB){
    // http://stackoverflow.com/questions/27928/how-do-i-calculate-distance-between-two-latitude-longitude-points
    var R = 6371; // Radius of the earth in km    
    var dLat = this.degToRad(latB - latA);
    var dLon = this.degToRad(lonB - lonA); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.degToRad(latA)) * Math.cos(this.degToRad(latB)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
};

Map.degToRad = function(deg){
    return deg * Math.PI / 180;
};

Map.radToDeg = function(rad){
    return rad * 180 / Math.PI;
};


})(jQuery);



