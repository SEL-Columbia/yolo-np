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
        .attr('width', width)
        .attr('height', height)
        .on('click', this.onclick)
        .call(this.zoom)
        .on('dblclick.zoom', null);

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
        d3.selectAll('.costs')
            .attr('style', 'display:none');
    } else if (key === 80) {
        // p, for point
        self.mode = 'point';
        self.setStatus('Point mode');
    } else if (key === 67) {
        // c, for costs
        self.getCosts();
        d3.select('.costs')
            .attr('style', 'display:block');
    }
};

Yolo.onclick = function(d) {
    var self = Yolo;
    if (self.mode === 'point') {
        console.log('yo')
        var coordinates = self.projection.invert(d3.mouse(this));
        self.currentNode = coordinates;
        self.points.push(coordinates);
        self.drawPoints();
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

    // Reproject vector layer
    self.vector.selectAll('circle')
        .attr('cx', function(d) { return self.projection(d)[0]; })
        .attr('cy', function(d) { return self.projection(d)[1]; });
    
    self.vector.selectAll('path')
        .attr('d', self.path);
};

Yolo.mousemove = function() {
    var self = Yolo;
    var coord = self.projection.invert(d3.mouse(this));

    d3.select('.cursor_coordinates')
        .html(coord[0].toFixed(4) + ', ' + coord[1].toFixed(4));

    if (self.mode === 'point') {
        self.vector
            .selectAll('.cursor')
            .remove();

        if (self.currentNode) {
            self.vector.append('path')
                .datum({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [self.currentNode, coord]
                    }
                })
                .attr('d', self.path)
                .attr('class', 'cursor edge');
        }

        self.vector.append('circle')
            .datum(coord)
            .attr('cx', function(d) { return self.projection(d)[0]; })
            .attr('cy', function(d) { return self.projection(d)[1]; })
            .attr('r', 5)
            .attr('class', 'cursor node');
    }
};

Yolo.drawPoints = function() {
    var self = this;

    // Draw lines
    self.vector
        .append('path')
        .datum({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: self.points
            }
        })
        .attr('d', self.path)
        .attr('class', 'edge');

    // Draw nodes
    self.vector
        .selectAll('.node')
        .remove();

    self.vector
        .selectAll('.node')
        .data(self.points)
        .enter()
        .append('circle')
        .attr('cx', function(d) { return self.projection(d)[0]; })
        .attr('cy', function(d) { return self.projection(d)[1]; })
        .attr('r', 5)
        .attr('class', 'node');
};

Yolo.getCosts = function() {
    var dist = 0;
    for (var i=0, pointA; pointA = this.points[i]; i++) {
        var pointB = this.points[i + 1];
        if (pointB){
            dist += this.distBetweenPoints(pointA[1], pointA[0], pointB[1], pointB[0]);
        }
    }
    return {
        distance: dist,
        num_poles: Math.floor(dist / 100),
        total_demand: 10000
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


