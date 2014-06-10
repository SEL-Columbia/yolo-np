
var width = window.innerWidth,
    height = window.innerHeight;

var tile = d3.geo.tile()
    .size([width, height]);

var projection = d3.geo.mercator()
    .scale((1 << 12) / 2 / Math.PI)
    .translate([width / 2, height / 2]);

var center = projection([-5.77599353, 13.61105531]);

var path = d3.geo.path()
    .projection(projection);

var zoom = d3.behavior.zoom()
    .scale(projection.scale() * 2 * Math.PI)
    .scaleExtent([1 << 11, 1 << 14])
    .translate([width - center[0], height - center[1]])
    .on('zoom', zoomed);

var svg = d3.select('#map').append('svg')
    .attr('width', width)
    .attr('height', height);

var raster = svg.append('g')
    .on("click", function(d) {
        zoomed();

        console.log(projection.invert(d3.mouse(this)));
    });

var vector = svg.append('g');

function what(){
    var coordinates = projection([-5.77599353, 13.61105531]);

    vector.append('svg:circle')
        .attr('cx', coordinates[0])
        .attr('cy', coordinates[1])
        .attr('r', 5)
        .attr('class', 'node');
}

/*
d3.json("/d/4090846/us.json", function(error, us) {
  svg.call(zoom);
  vector.datum(topojson.mesh(us, us.objects.states));
  zoomed();
});
*/



svg.call(zoom);


zoomed();


function zoomed() {
    var tiles = tile
        .scale(zoom.scale())
        .translate(zoom.translate())
        ();
    
    projection
        .scale(zoom.scale() / 2 / Math.PI)
        .translate(zoom.translate());
    
    vector
        .attr("d", path);
    
    var image = raster
        .attr("transform", "scale(" + tiles.scale + ")translate(" + tiles.translate + ")")
        .selectAll("image")
        .data(tiles, function(d) { return d; });
    
    image.exit()
        .remove();
    
    image.enter().append("image")
        .attr("xlink:href", function(d) {
            return 'http://mt' + Math.round(Math.random() * 3) + '.google.com/vt/lyrs=y&x=' + d[0] + '&y=' + d[1] + '&z=' + d[2];
        })
        .attr("width", 1)
        .attr("height", 1)
        .attr("x", function(d) { return d[0]; })
        .attr("y", function(d) { return d[1]; });
}








Map = {
    map: null,
    buildMode: false,
    points: []
};

Map.init = function(){
    // Initialize map
    var self = this;
    self.map = L.map('map', {zoomAnimation: false, inertia: false})
        .setView([13.61105531, -5.77599353], 15);

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


