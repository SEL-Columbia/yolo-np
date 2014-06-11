Yolo = {
    mode: null,
    currentNode: null,
    points: []
};

Yolo.init = function() {
    var width = window.innerWidth,
        height = window.innerHeight;

    this.tile = d3.geo.tile()
        .size([width, height]);

    this.projection = d3.geo.mercator()
        .scale((1 << 12) / 2 / Math.PI)
        .translate([width / 2, height / 2]);

    this.path = d3.geo.path()
        .projection(this.projection);

    var center = this.projection([-5.77599353, 13.61105531]);

    this.zoom = d3.behavior.zoom()
        .scale(this.projection.scale() * 2 * Math.PI)
        .scaleExtent([1 << 11, 1 << 25])
        .translate([width - center[0], height - center[1]])
        .on('zoom', this.onzoom);

    var svg = d3.select('#map')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .on('dblclick.zoom', null)
        .on('click', this.onclick)
        .call(this.zoom);

    this.raster = svg.append('g');
    this.vector = svg.append('g');

    d3.select('body')
        .on('mousemove', this.mousemove)
        .on('keydown', this.keydown);

    this.onzoom();
};


Yolo.setStatus = function(status) {
    d3.select('.header_status')
        .html(status);
};

Yolo.keydown = function() {
    var self = Yolo;
    var key = d3.event.keyCode;
    console.log(key);
    if (key === 27) {
        // Escape
        self.mode = null;
        self.currentNode = null;
        self.setStatus('');
        self.vector
            .selectAll('.cursor')
            .remove();
    } else if (key === 80) {
        // p, for point
        self.mode = 'point';
        self.setStatus('Point mode');
    }
};

Yolo.onclick = function(d) {
    var self = Yolo;
    if (self.mode === 'point'){
        console.log('yo')
        var coordinates = self.projection.invert(d3.mouse(this));
        self.vector.append('svg:circle')
            .datum(coordinates)
            .attr('cx', function(d) { return self.projection(d)[0]; })
            .attr('cy', function(d) { return self.projection(d)[1]; })
            .attr('r', 5)
            .attr('class', 'node');
    }
};

Yolo.onzoom = function() {
    var self = Yolo;
    var tiles = self.tile
        .scale(self.zoom.scale())
        .translate(self.zoom.translate())
        ();
    
    self.projection
        .scale(self.zoom.scale() / 2 / Math.PI)
        .translate(self.zoom.translate());

    var image = self.raster
        .attr('transform', 'scale(' + tiles.scale + ')translate(' + tiles.translate + ')')
        .selectAll('image')
        .data(tiles, function(d) { return d; });
    
    image.exit()
        .remove();
    
    image.enter().append('image')
        .attr('xlink:href', function(d) {
            return 'http://mt' + Math.round(Math.random() * 3) + '.google.com/vt/lyrs=y&x=' + d[0] + '&y=' + d[1] + '&z=' + d[2];
        })
        .attr('width', 1)
        .attr('height', 1)
        .attr('x', function(d) { return d[0]; })
        .attr('y', function(d) { return d[1]; });

    self.vector.selectAll('circle')
        .attr('cx', function(d) { return self.projection(d)[0]; })
        .attr('cy', function(d) { return self.projection(d)[1]; });
};

Yolo.mousemove = function() {
    var self = Yolo;
    var coord = self.projection.invert(d3.mouse(this));

    d3.select('.cursor_coordinates')
        .html(coord[0].toFixed(4) + ', ' + coord[1].toFixed(4));

    if (self.mode === 'point') {
        self.vector
            .select('.cursor')
            .remove();

        self.vector.append('svg:circle')
            .datum(coord)
            .attr('cx', function(d) { return self.projection(d)[0]; })
            .attr('cy', function(d) { return self.projection(d)[1]; })
            .attr('r', 5)
            .attr('class', 'cursor node');
    }
};

Yolo.drawPowerPoles = function(){
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

Yolo.generatePoints = function(pointA, pointB, interval){
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

Yolo.distBetweenPoints = function(latA, lonA, latB, lonB){
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

Yolo.degToRad = function(deg){
    return deg * Math.PI / 180;
};

Yolo.radToDeg = function(rad){
    return rad * 180 / Math.PI;
};


