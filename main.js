Yolo = {
    tileCache: false,
    mode: null,
    currentNode: null,
    points: []
};

Yolo.init = function() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.initTileCache();
    
    this.tile = d3.geo.tile()
        .size([this.width, this.height]);

    this.projection = d3.geo.mercator()
        .center([40.809657, -73.960076])
        .scale((1 << 12) / 2 / Math.PI)
        .translate([this.width / 2, this.height / 2]);

    this.path = d3.geo.path()
        .projection(this.projection);

    this.zoom = d3.behavior.zoom()
        .translate(this.projection.translate())
        .scale(this.projection.scale() * 4 * Math.PI)
        .scaleExtent([1 << 11, 1 << 28])
        .on('zoom', this.onzoom);

    var svg = d3.select('.map')
        .attr('width', this.width)
        .attr('height', this.height)
        .on('click', this.onclick)
        .call(this.zoom)
        .on('dblclick.zoom', null);

    this.raster = svg.append('g');
    this.vector = svg.append('g');

    d3.select('body')
        .on('mousemove', this.mousemove)
        .on('keydown', this.keydown);

    this.onzoom();

    //navigator.geolocation.getCurrentPosition(this.setCenter);
};


Yolo.init = function() {
    var self = this;

    this.initTileCache();
    
    var funcLayer = new L.TileLayer.Functional(function(view) {
        var deferred = $.Deferred();
        var url = 'http://mt' + Math.round(Math.random() * 3) + 
            '.google.com/vt/lyrs=y&x={y}&y={x}&z={z}'
            .replace('{z}', view.zoom)
            .replace('{x}', view.tile.row)
            .replace('{y}', view.tile.column);
        self.getCachedImage(url, deferred.resolve);
        return deferred.promise();
    });

    var map = new L.Map('map', { center: new L.LatLng(42.3584308, -71.0597732), zoom: 15, layers: [funcLayer] });

    map.locate({setView: true, maxZoom: 16});
};


Yolo.setCenter = function(position) {
    var self = Yolo;
    var coords = position.coords;
    var center = self.projection([coords.longitude, coords.latitude]);

    self.zoom
        .translate([self.width - center[0], self.height - center[1]])
        .scale(1 << 15);
    self.onzoom();
};

Yolo.initTileCache = function() {
    var self = this;

    // FileSystem API
    // http://www.html5rocks.com/en/tutorials/file/filesystem/
    // It's faster than IndexedDB, but is deprecated
    if (window.requestFileSystem || window.webkitRequestFileSystem) {
        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

        function init(fs) {
            self.fs_cache = fs;
            self.tileCache = true;
        }

        function fileErrorHandler(e) {
            console.log(e)
        }

        window.requestFileSystem(
            window.TEMPORARY, 20*1024*1024, init, fileErrorHandler);

    // IndexedDB
    // http://www.html5rocks.com/en/tutorials/indexeddb/todo/
    // Blob support was just added in Chrome Canary (as of July 2014)
    } else if (window.indexedDB) {
        var request = window.indexedDB.open('tileCache', 5);

        request.onerror = function(event) {
            console.log("Error creating/accessing IndexedDB database");
        };

        request.onsuccess = function(event) {
            console.log("Success creating/accessing IndexedDB database");
            self.tileCache = true;            
            self.idb_cache = request.result;
            self.idb_cache.onerror = function(event) {
                console.log("Error creating/accessing IndexedDB database");
            };
            //self.db.getObjectStore('tiles').clear();
        };

        request.onupgradeneeded = function(event) {
            self.idb_cache = event.target.result;
            self.idb_cache.createObjectStore('tiles');
        };
    }
};

Yolo.getCachedImage = function(url, cb) {
    var self = this;

    if (!self.tileCache) {
        return cb(url);
    }

    // Remove subdomain from tile image url
    var imgKey = url.split('.').slice(1).join('.').replace(/\//g, '');

    if (self.fs_cache) {
        self.fs_cache.root.getFile(imgKey, {}, function(fileEntry) {
            fileEntry.file(function(imgFile) {
                var URL = window.URL || window.webkitURL;
                var imgURL = URL.createObjectURL(imgFile);
                cb(imgURL);
            });
        }, function onerror(e) {
            if (e.NOT_FOUND_ERR) {
                self.fetchImage(url, cb);
            }
        });
    } else if (self.idb_cache) {
        var store = self.idb_cache
            .transaction(['tiles'], 'readwrite')
            .objectStore('tiles');
        var request = store.get(imgKey);

        request.onsuccess = function(event) {
            var imgFile = event.target.result;
            if (imgFile) {
                var URL = window.URL || window.webkitURL;
                var imgURL = URL.createObjectURL(imgFile);
                cb(imgURL);
            } else {
                self.fetchImage(url, cb);
            }
        };
        request.onerror = function(event) {
            console.log('error');
        };
    }
};

Yolo.fetchImage = function(url, cb) {
    var self = this;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.addEventListener('load', function() {
        if (xhr.status === 200) {
            self.saveCachedImage(url, xhr.response, cb);
        }
    }, false);
    xhr.send();
};

Yolo.saveCachedImage = function(url, imgBlob, cb) {
    var self = this;
    var imgKey = url.split('.').slice(1).join('.').replace(/\//g, '');

    if (self.fs_cache) {
        function fileErrorHandler(e) {
            console.log(imgKey, e);
        }
        self.fs_cache.root.getFile(imgKey, {create: true}, function(fileEntry) {
            fileEntry.createWriter(function(fileWriter){
                fileWriter.onwriteend = function(e) {
                    console.log('Write completed.');
                    self.getCachedImage(url, cb);
                };

                fileWriter.onerror = function(e) {
                    console.log('Write failed: ' + e.toString());
                };
                fileWriter.write(imgBlob);
                self.getCachedImage(url, cb);
            }, fileErrorHandler);
        }, fileErrorHandler);
    } else if (self.idb_cache) {
        self.idb_cache
            .transaction(['tiles'], 'readwrite')
            .objectStore('tiles')
            .put(xhr.response, imgKey);
        self.getCachedImage(url, cb);
    }
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
            var url = 'http://mt' + Math.round(Math.random() * 3) +
                '.google.com/vt/lyrs=y&x=' + d[0] + '&y=' + d[1] + '&z=' + d[2];
            if (self.tileCache) {
                self.getCachedImage(url, this);
                return '';
            } else {
                return url;
            }
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
        num_poles: Math.floor(dist * 10),
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


