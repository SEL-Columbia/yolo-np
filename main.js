// https://github.com/zetter/voronoi-maps/blob/master/lib/voronoi_map.js
// http://chriszetter.com/voronoi-map/examples/uk-supermarkets/
// https://github.com/mbostock/bost.ocks.org/blob/gh-pages/mike/leaflet/index.html#L131-171


Yolo = {
    tileCache: false,
    mode: null,
    currentNode: null,
    points: [],
    map: null,
    vector: null
};


Yolo.init = function() {
    var self = this;

    self.initTileCache();

    self.map = L.map('map', {
            center: [40.809400, -73.960029],
            zoom: 16,
            zoomControl: false,
            attributionControl: false
        })
        .on('click', self.onclick)
        .on('viewreset', self.onreset)
        .on('moveend', self.onreset);
    
    // Add vector layer
    var size = self.map.getSize();
    self.vector = d3.select(self.map.getPanes().overlayPane)
        .append('svg')
        .attr('width', size.x + 'px')
        .attr('height', size.y + 'px')
        .append('g')
        .attr('class', 'leaflet-zoom-hide');

    // Tile layer
    var funcLayer = new L.TileLayer.Functional(function(view) {
        var deferred = $.Deferred();
        var url = 'http://mt' + Math.round(Math.random() * 3) + 
            '.google.com/vt/lyrs=y&x={y}&y={x}&z={z}'
            .replace('{z}', Math.floor(view.zoom))
            .replace('{x}', view.tile.row)
            .replace('{y}', view.tile.column);
        self.getCachedImage(url, deferred.resolve);
        return deferred.promise();
    });

    self.map.addLayer(funcLayer)
        .locate({
            setView: true,
            maxZoom: 20,
            enableHighAccuracy: true
        });
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
            .put(imgBlob, imgKey);
        self.getCachedImage(url, cb);
    }
};


Yolo.setStatus = function(status) {
    d3.select('.header_status')
        .html(status);
};

Yolo.onclick = function(e) {
    var self = Yolo;
    var point = e.layerPoint;
    self.vector
        .append('svg:circle')
        .datum(e.latlng)
        .attr('r', 5)
        .attr('class', 'node');

    // Draw line from currentNode
    if (self.currentNode) {
        self.vector
            .append('svg:line')
            .datum([self.currentNode, e.latlng])
            .attr('class', 'line');
    }
    self.currentNode = e.latlng;
    self.onreset();
};

Yolo.onreset = function() {
    // Updates the vector layer on map move/zoom
    var self = Yolo;

    var bounds = self.map.getBounds();
    var offset = self.map.latLngToLayerPoint(bounds.getNorthWest());

    // Reverse .map-pane transform
    d3.select('svg')
        .attr('style', '-webkit-transform: translate3d(' + offset.x + 'px,' + offset.y + 'px, 0);');

    // Reposition circles
    self.vector
        .selectAll('circle')
        .each(function(d) {
            var point = self.map.latLngToLayerPoint(d);
            this.setAttribute('cx', point.x - offset.x);
            this.setAttribute('cy', point.y - offset.y);
        });

    // Reposition lines
    self.vector
        .selectAll('line')
        .each(function(d) {
            var p1 = self.map.latLngToLayerPoint(d[0]);
            var p2 = self.map.latLngToLayerPoint(d[1]);
            this.setAttribute('x1', p1.x - offset.x);
            this.setAttribute('y1', p1.y - offset.y);
            this.setAttribute('x2', p2.x - offset.x);
            this.setAttribute('y2', p2.y - offset.y);
        });
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


