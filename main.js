var Yolo = {
    tileCache: false,
    selected: null,
    dragging: false,
    points: {}, // {id: {lat: 10, lng: 10}}
    lines: {},  // {id: {p1: id1, p2: id2}}
    map: null,
    touchevent: null, // For long press events
    location: null,
    id_count: 1
};

Yolo.init = function() {
    var self = this;

    // Initialize IndexedDB
    // http://www.html5rocks.com/en/tutorials/indexeddb/todo/
    // Blob support was just added in Chrome Canary (as of July 2014)
    console.log('Initializing IndexedDB tile cache');
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
        self.initMap();
    };

    request.onupgradeneeded = function(event) {
        self.idb_cache = event.target.result;
        self.idb_cache.createObjectStore('tiles');
    };
};

Yolo.initMap = function() {
    var self = this;
    $('.loading').hide();
    
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
            //self.update();
        });


    // Tile layer
    var funcLayer = new L.TileLayer.Functional(function(view) {
        var deferred = $.Deferred();
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
        .on('touchstart', MapEvents.ontouchstart)
        .on('touchmove', MapEvents.ontouchmove)
        .on('touchend', MapEvents.ontouchend);
    
    self.drag = d3.behavior.drag()
        .origin(function(d) { return d; })
        .on('drag', MapEvents.ondrag)
        .on('dragstart', MapEvents.ondragstart)
        .on('dragend', MapEvents.ondragend);

    // Control events
    d3.select('.location_btn')
        .on('click', function() {
            if (self.location) self.map.panTo(self.location);
        });
        
    d3.select('.controls_delete')
        .on('click', function() {
            if (self.selected) {
                delete self.points[self.selected];
                delete self.lines[self.selected];
                var lines = {};
                d3.map(self.lines).forEach(function(id, points) {
                    if (points[0] != self.selected && points[1] != self.selected) {
                        lines[id] = points;
                    }
                });
                self.lines = lines;
                self.selected = null;
                self.update();
            }
        });

    self.load();
};

Yolo.save = function() {
    localStorage['points'] = JSON.stringify(this.points);
    localStorage['lines'] = JSON.stringify(this.lines);
};

Yolo.load = function() {
    this.points = JSON.parse(localStorage['points'] || '{}');
    this.lines = JSON.parse(localStorage['lines'] || '{}');
    var ids = d3.keys(this.points)
        .concat(d3.keys(this.lines))
        .map(function(i) { return parseInt(i); });
    this.id_count = ids.length ? Math.max.apply(null, ids) + 1 : 1;
    this.update();
};

Yolo.status = function(status) {
    d3.select('.header_status')
        .html(status);
};

Yolo.getImage = function(url, cb) {
    // Retrieves an image from cache, possibly fetching it first
    var self = this;

    if (!self.tileCache) return cb(url);

    // Remove subdomain from tile image url
    var imgKey = url.split('.').slice(1).join('.').replace(/\//g, '');
    var store = self.idb_cache
        .transaction(['tiles'], 'readwrite')
        .objectStore('tiles');
    var request = store.get(imgKey);

    request.onsuccess = function(event) {
        var imgFile = event.target.result;
        if (imgFile) {
            //var URL = window.URL || window.webkitURL;
            //var imgURL = URL.createObjectURL(imgFile);
            cb(imgFile);
        } else {
            self.fetchImage(url, cb);
        }
    };
    request.onerror = function(event) {
        console.log('error');
    };
};

Yolo.fetchImage = function(url, cb) {
    var self = Yolo;
    Utils.convertImgToBase64(url, function(dataURL) {
        self.saveImage(url, dataURL, cb);
    }, 'image/png');
    return;
    
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
    self.idb_cache
        .transaction(['tiles'], 'readwrite')
        .objectStore('tiles')
        .put(imgBlob, imgKey);
    self.getImage(url, cb);
};

Yolo.showControls = function() {
    if (this.selected) {
        var line = this.lines[this.selected];
        var point = this.points[this.selected];
        if (point) {
            var info = '#' + this.selected + ': ' + point.lat.toFixed(3) + ', ' + point.lng.toFixed(3);
        } else if (line) {
            var p1 = this.points[line[0]];
            var p2 = this.points[line[1]];
            var dist = this.dist(p1.lat, p1.lng, p2.lat, p2.lng);
            var info = '#' + this.selected + ': ' + dist.toFixed(2) + ' km';
        }
        $('.controls_info').text(info);
        $('.location_btn').attr('class', 'location_btn higher');
        $('.controls').show();
    } else {
        $('.controls').hide();
        $('.location_btn').attr('class', 'location_btn');
    }
};

Yolo.update = function() {
    window.requestAnimationFrame(Yolo.updateVectors);
};

Yolo.updateVectors = function() {
    console.log('update')
    var self = Yolo;
    var size = self.map.getSize();
    var bounds = self.map.getBounds();
    var offset = self.map.latLngToLayerPoint(bounds.getNorthWest());

    // Clear layer
    d3.select('.map g').remove();

    // Set size & reverse .map-pane transform
    var g = d3.select('.map svg')
        .attr('width', size.x + 'px')
        .attr('height', size.y + 'px')
        .attr('style', '-webkit-transform: translate3d(' + offset.x + 'px,' + offset.y + 'px, 0);')
        // Add vector layer
        .append('g')
        .attr('class', 'leaflet-zoom-hide')
        .on('mouseover', MapEvents.onmouseover, true)
        .on('mouseout', MapEvents.onmouseover, true);

    // Draw location
    if (self.location) {
        var p = self.map.latLngToLayerPoint(self.location);
        g.append('circle')
            .attr('class', 'location')
            .attr('r', 10)
            .attr('cx', p.x - offset.x)
            .attr('cy', p.y - offset.y);
    }
    
    // Draw lines
    g.selectAll()
        .data(d3.entries(self.lines))
        .enter()
        .append('svg:line')
        .attr('class', function(d) {
            return d.key == self.selected ? 'line selected' : 'line';
        })
        .attr('data-id', function(d) {
            return d.key;
        })
        .each(function(d) {
            var latlng1 = self.points[d.value[0]];
            var latlng2 = self.points[d.value[1]];
            var p1 = self.map.latLngToLayerPoint(latlng1);
            var p2 = self.map.latLngToLayerPoint(latlng2);
            this.setAttribute('x1', p1.x - offset.x);
            this.setAttribute('y1', p1.y - offset.y);
            this.setAttribute('x2', p2.x - offset.x);
            this.setAttribute('y2', p2.y - offset.y);

            // Add power poles if line is selected
            // (d[0] === self.selected || d[1] === self.selected)
            if (!self.dragging) {                
                g.selectAll()
                    .data(self.intervals(latlng1, latlng2, 100))
                    .enter()
                    .append('svg:circle')
                    .attr('r', 3)
                    .attr('class', 'pole')
                    .each(function(d){
                        var point = self.map.latLngToLayerPoint(d);
                        this.setAttribute('cx', point.x - offset.x);
                        this.setAttribute('cy', point.y - offset.y);
                    });
            }
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
        .attr('class', function(d) {
            return d[0] == self.selected ? 'point selected' : 'point';
        })
        .attr('data-id', function(d) {
            return d[0];
        })
        .attr('r', 6)
        .each(function(d) {
            var point = self.map.latLngToLayerPoint(d[1]);
            this.setAttribute('cx', point.x - offset.x);
            this.setAttribute('cy', point.y - offset.y);
        });
    
    g.selectAll('.selected')
        .call(self.drag);
};



var MapEvents = {};
MapEvents.ontouchstart = function() {
    // Used to detect long press
    console.log('touchstart', d3.event.target);
    Yolo.touchevent = d3.event;
    window.clearTimeout(Yolo.touchtimer);
    Yolo.touchtimer = window.setTimeout(MapEvents.onlongpress, 700);
};


MapEvents.ontouchmove = function() {
    console.log('touchmove')
    if (Yolo.touchevent) {
        var touch = d3.event.touches[0];
        var ts = Yolo.touchevent.touches[0];
        var dx = Math.abs(touch.screenX - ts.screenX);
        var dy = Math.abs(touch.screenY - ts.screenY);
        if (dx > 5 || dy > 5) {
            Yolo.touchevent = null;
        }
    }
};

MapEvents.ontouchend = function() {
    console.log('touchend', d3.event.target)
    var e = d3.event;
    window.clearTimeout(Yolo.touchtimer);
    if (Yolo.touchevent) {
        var tapTime = e.timeStamp - self.touchevent.timeStamp;
        var id = e.target.dataset.id;
        if (e.target === self.touchevent.target && tapTime < 300 && id) {
            Yolo.selected = id;
        } else {
            Yolo.selected = null;
        }
        Yolo.showControls();
        Yolo.update();
    }
    Yolo.touchevent = null;
};

MapEvents.onlongpress = function() {
    // Creates a new point or line
    console.log('longpress')
    var e = Yolo.touchevent;
    if (!e) return;
    var touch = e.touches[0];
    
    if (e.target.classList.contains('point')) {
        // Exisiting point
        var id = parseInt(e.target.dataset.id);
    } else {
        // Add a new point
        var id = self.id_count++;
        var latlng = Yolo.map.containerPointToLatLng([
            touch.screenX,
            touch.screenY
        ]);
        Yolo.points[id] = {lat: latlng.lat, lng: latlng.lng};
        
        if (e.target.classList.contains('line')) {
            // Split line if point falls on it
            var lineId = parseInt(e.target.dataset.id);
            var line = self.lines[lineId];
            Yolo.lines[lineId] = [line[0], id];
            Yolo.lines[self.id_count++] = [line[1], id];
        }
    }
    
    if (self.selected && self.points[self.selected]) {
        // Add line if it doesn't already exist
        var addLine = d3.values(self.lines)
            .every(function(line) {
                if ((self.selected === line[0] && id === line[1]) ||
                    (self.selected === line[1] && id === line[0])) {
                    return false;
                }
                return true;
            });
        
        if (addLine) {
            self.lines[self.id_count++] = [self.selected, id];
        }
    }
    self.selected = id;
    navigator.vibrate(100);
    self.touchevent = null;
    self.save();
    self.showControls();
    self.update();
};

MapEvents.ondragstart = function() {
    console.log('dragstart')
    var self = Yolo;
    self.map.dragging.disable();
    self.dragging = true;
};

MapEvents.ondrag = function(d) {
    console.log('dragging')
    var self = MapEvents;
    var e = d3.event.sourceEvent;
    var id = d3.select(this).datum()[0];
    var xy = e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.x, e.y];
    self.points[id] = self.map.containerPointToLatLng(xy);
    self.update();
    window.clearTimeout(self.touchtimer);
    Yolo.touchevent = null;
    Yolo.dragging = true;
    Yolo.showControls();
};

MapEvents.ondragend = function() {
    // http://stackoverflow.com/questions/19075381/d3-mouse-events-click-dragend
    console.log('dragend')
    Yolo.map.dragging.enable();
    Yolo.save();
    MapEvents.dragging = false;
    Yolo.update();
};



var Utils = {};
Utils.convertImgToBase64 = function(url, callback, outputFormat){
    var canvas = document.createElement('CANVAS'),
        ctx = canvas.getContext('2d'),
        img = new Image;
    img.crossOrigin = 'Anonymous';
    img.onload = function(){
        var dataURL;
        canvas.height = img.height;
        canvas.width = img.width;
        ctx.drawImage(img, 0, 0);
        dataURL = canvas.toDataURL(outputFormat);
        callback.call(this, dataURL);
        canvas = null; 
    };
    img.src = url;
};

Utils.costs = function() {
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

Utils.intervals = function(pointA, pointB, interval) {
    // Returns a list of points between A and B at intervals of X meters
    var self = this;
    var points = [];
    var dist = self.dist(pointA.lat, pointA.lng, pointB.lat, pointB.lng) * 1000;
    var nSplits = Math.floor(dist / interval);
    var splitLat = (pointB.lat - pointA.lat) / nSplits;
    var splitLon = (pointB.lng - pointA.lng) / nSplits;
    for (var i=1; i < nSplits; i++) {
        points.push([i * splitLat + pointA.lat, i * splitLon + pointA.lng]);
    }
    return points;
};

Utils.dist = function(latA, lonA, latB, lonB) {
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


Utils.deg2rad = function(deg) {
    return deg * Math.PI / 180;
};

Utils.rad2deg = function(rad) {
    return rad * 180 / Math.PI;
};




