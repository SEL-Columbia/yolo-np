// https://github.com/zetter/voronoi-maps/blob/master/lib/voronoi_map.js
// http://chriszetter.com/voronoi-map/examples/uk-supermarkets/
// https://github.com/mbostock/bost.ocks.org/blob/gh-pages/mike/leaflet/index.html#L131-171



Yolo = {
    tileCache: false,
    mode: 'point', // null, 'point', 'line'
    selected: null,
    location: null,
    id_count: 0,
    points: {}, // {node_id: latlng}
    lines: {}, // [[p0, p1], ...]
    map: null,
};


Yolo.init = function() {
    var self = this;

    self.initTileCache();
    
    // Leaflet & events
    self.map = L.map('map', {
            center: [40.809400, -73.960029],
            zoom: 16,
            zoomControl: false,
            doubleClickZoom: false,
            attributionControl: false
        })
        .on('viewreset', self.update)
        .on('moveend', self.update)
        .locate({
            watch: true,
            maxZoom: 20,
            enableHighAccuracy: true
        })
        .on('locationfound', function(e) {
            self.location = e.latlng;
            self.update();
        });


    // Tile layer
    var funcLayer = new L.TileLayer.Functional(function(view) {
        var deferred = $.Deferred();
        var url = 'http://mt{s}.google.com/vt/lyrs=y&x={y}&y={x}&z={z}'
            .replace('{s}', Math.round(Math.random() * 3))
            .replace('{z}', Math.floor(view.zoom))
            .replace('{x}', view.tile.row)
            .replace('{y}', view.tile.column);

        var url = 'http://{s}.tiles.mapbox.com/v3/examples.map-20v6611k/{z}/{y}/{x}.png'
            .replace('{s}', 'abcd'[Math.round(Math.random() * 3)])
            .replace('{z}', Math.floor(view.zoom))
            .replace('{x}', view.tile.row)
            .replace('{y}', view.tile.column);
        self.getImage(url, deferred.resolve);
        return deferred.promise();
    });

    self.map.addLayer(funcLayer);

    // Vector Layer
    self.svg = d3.select(self.map.getPanes().overlayPane)
        .append('svg');

    // Map Events
    d3.select('.map')
        .on('click', self.onclick);

    self.drag = d3.behavior.drag()
        .origin(function(d) { return d; })
        .on('drag', self.ondrag)
        .on('dragstart', self.ondragstart)
        .on('dragend', self.ondragend);

    // Control events
    d3.select('.controls_cancel')
        .on('click', function() {
            self.mode = null;
            self.selected = null;
        });
        
    d3.select('.controls_locate')
        .on('click', function() {
            if (self.location) self.map.panTo(self.location);
        });

    d3.selectAll('.controls_point, .controls_line')
        .on('click', function() {
            if (this.classList.contains('controls_point')) {
                self.mode = 'point';
            } else {
                self.mode = 'line';
            }
        });

    self.load();
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


Yolo.getImage = function(url, cb) {
    // Retrieves an image from cache, possibly fetching it first
    var self = this;

    if (!self.tileCache) return cb(url);

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
            self.saveImage(url, xhr.response, cb);
        }
    }, false);
    xhr.send();
};


Yolo.saveImage = function(url, imgBlob, cb) {
    var self = this;
    var imgKey = url.split('.').slice(1).join('.').replace(/\//g, '');

    if (self.fs_cache) {
        function fileErrorHandler(e) {
            console.log(imgKey, e);
        }
        self.fs_cache.root.getFile(imgKey, {create: true}, function(fileEntry) {
            fileEntry.createWriter(function(fileWriter){
                fileWriter.onwriteend = function(e) {
                    self.getImage(url, cb);
                };

                fileWriter.onerror = function(e) {
                    console.log('Write failed: ' + e.toString());
                };
                fileWriter.write(imgBlob);
                self.getImage(url, cb);
            }, fileErrorHandler);
        }, fileErrorHandler);
    } else if (self.idb_cache) {
        self.idb_cache
            .transaction(['tiles'], 'readwrite')
            .objectStore('tiles')
            .put(imgBlob, imgKey);
        self.getImage(url, cb);
    }
};


Yolo.save = function() {
    localStorage['nodes'] = JSON.stringify(this.nodes);
    localStorage['lines'] = JSON.stringify(this.lines);
};


Yolo.load = function() {
    this.nodes = JSON.parse(localStorage['nodes'] || '[]');
    this.lines = JSON.parse(localStorage['lines'] || '[]');
};


Yolo.status = function(status) {
    d3.select('.header_status')
        .html(status);
};

Yolo.onclick = function() {
    console.log('click')
    var self = Yolo;
    var e = d3.event;
    var element = e.toElement.nodeName === 'circle' && element.classList.contains('point') ? 
        e.toElement : null;
    var xy = element ? [
            parseInt(element.getAttribute('cx')),
            parseInt(element.getAttribute('cy'))
        ] : [e.x, e.y];
    var point = self.map.containerPointToLatLng(xy);

    if (self.dragging) {
        return;
    } else if (self.mode === 'point' || self.mode === 'line') {
        if (element) {
            var id = parseInt(d3.select(element).data()[0]);
        } else {
            var id = self.id_count++;
            self.points[id] = point;
        }
        if (self.mode === 'line' && self.selected) {
            self.lines.push([self.selected, id]);
        }
        self.selected = id;
    } else {
        self.selected = null;
    }
    self.update();
    d3.event.stopPropagation();
};


Yolo.ondragstart = function() {
    var self = Yolo;
    self.map.dragging.disable();
    self.dragging = true;
};


Yolo.ondrag = function(d) {
    var self = Yolo;
    var e = d3.event.sourceEvent;
    var id = d3.select(this).datum()[0];
    var xy = e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.x, e.y];
    self.points[id] = self.map.containerPointToLatLng(xy);
    self.update();
};


Yolo.ondragend = function() {
    // http://stackoverflow.com/questions/19075381/d3-mouse-events-click-dragend
    console.log('dragend')
    var self = Yolo;
    self.map.dragging.enable();
    self.dragging = false;
};


Yolo.onmouseover = function() {
    var element = d3.event.toElement;
    //console.log('mouseover', element.className)
    if (element.classList.contains('node') || element.classList.contains('line')) {
        //element.classList.push('');
    }
};


Yolo.onmouseout = function() {
    //console.log('mouseout', d3.event);

};


Yolo.onmousemove = function() {
    
};


Yolo.update = function() {
    window.requestAnimationFrame(Yolo.updateVectorLayer);
};


Yolo.updateVectorLayer = function() {
    var self = Yolo;
    var size = self.map.getSize();
    var bounds = self.map.getBounds();
    var offset = self.map.latLngToLayerPoint(bounds.getNorthWest());

    // Clear layer
    d3.select('g').remove();

    // Set size & reverse .map-pane transform
    var g = d3.select('.map svg')
        .attr('width', size.x + 'px')
        .attr('height', size.y + 'px')
        .attr('style', '-webkit-transform: translate3d(' + offset.x + 'px,' + offset.y + 'px, 0);')
        // Add vector layer
        .append('g')
        .attr('class', 'leaflet-zoom-hide')
        .on('mouseover', self.onmouseover, true)
        .on('mouseout', self.onmouseover, true);

    // Draw lines
    g.selectAll()
        .data(self.lines)
        .enter()
        .append('svg:line')
        .attr('class', 'line')
        .each(function(d) {
            var latlng0 = self.points[d[0]];
            var latlng1 = self.points[d[1]];
            var p1 = self.map.latLngToLayerPoint(latlng0);
            var p2 = self.map.latLngToLayerPoint(latlng1);
            this.setAttribute('x1', p1.x - offset.x);
            this.setAttribute('y1', p1.y - offset.y);
            this.setAttribute('x2', p2.x - offset.x);
            this.setAttribute('y2', p2.y - offset.y);
            
            // Add power poles
            var poles = self.intervals(latlng0, latlng1, 100);
            g.selectAll()
                .data(poles)
                .enter()
                .append('svg:circle')
                .attr('r', 6)
                .attr('class', 'pole')
                .each(function(d){
                    var point = self.map.latLngToLayerPoint(d);
                    this.setAttribute('cx', point.x - offset.x);
                    this.setAttribute('cy', point.y - offset.y);
                });
        });

    // Draw points
    g.selectAll()
        .data(function() {
            var points = [];
            for (var id in self.points) {
                points.push([id, self.points[id]]);
            }
            return points;
        })
        .enter()
        .append('circle')
        .attr('class', 'point')
        .attr('r', 15)
        .call(self.drag)
        .each(function(d) {
            var point = self.map.latLngToLayerPoint(d[1]);
            this.setAttribute('cx', point.x - offset.x);
            this.setAttribute('cy', point.y - offset.y);
        });
        
    // Draw location
    if (self.location) {
        var p = self.map.latLngToLayerPoint(self.location);
        g.append('circle')
            .attr('class', 'location')
            .attr('r', 10)
            .attr('cx', p.x - offset.x)
            .attr('cy', p.y - offset.y);
    }
};


Yolo.costs = function() {
    var dist = 0;
    for (var i=0, pointA; pointA = this.points[i]; i++) {
        var pointB = this.points[i + 1];
        if (pointB){
            dist += this.dist(pointA[1], pointA[0], pointB[1], pointB[0]);
        }
    }
    return {
        distance: dist,
        num_poles: Math.floor(dist * 10),
        total_demand: 10000
    };
};


Yolo.intervals = function(pointA, pointB, interval){
    // Returns a list of points between A and B at intervals of X meters
    var self = this;
    var points = [];
    var dist = self.dist(pointA.lat, pointA.lng, pointB.lat, pointB.lng) * 1000;
    var nSplits = Math.floor(dist / interval);
    var splitLat = (pointB.lat - pointA.lat) / nSplits;
    var splitLon = (pointB.lng - pointA.lng) / nSplits;
    for (var i=1; i < nSplits; i++){
        points.push([i * splitLat + pointA.lat, i * splitLon + pointA.lng]);
    }
    return points;
};


Yolo.dist = function(latA, lonA, latB, lonB){
    // http://stackoverflow.com/questions/27928/how-do-i-calculate-distance-between-two-latitude-longitude-points
    var R = 6371; // Radius of the earth in km
    var dLat = this.deg2rad(latB - latA);
    var dLon = this.deg2rad(lonB - lonA);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.deg2rad(latA)) * Math.cos(this.deg2rad(latB)) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
};


Yolo.deg2rad = function(deg){
    return deg * Math.PI / 180;
};


Yolo.rad2deg = function(rad){
    return rad * 180 / Math.PI;
};
