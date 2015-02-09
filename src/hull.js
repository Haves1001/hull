/*
 (c) 2014, Andrey Geonya
 Hull.js, a JavaScript library for concave hull generation by set of points.
 https://github.com/AndreyGeonya/hull
*/

'use strict';

var intersect = require('./intersect.js');
var grid = require('./grid.js');

function _formatToXy(pointset, format) {
    if (format === undefined) {
        return pointset;
    }
    return pointset.map(function(pt) {
        /*jslint evil: true */
        var _getXY = new Function('pt', 'return [pt' + format[0] + ',' + 'pt' + format[1] + '];');
        return _getXY(pt);
    });
}

function _xyToFormat(pointset, format) {
    if (format === undefined) {
        return pointset;
    }
    return pointset.map(function(pt) {
        /*jslint evil: true */
        var _getObj = new Function('pt', 'var o = {}; o' + format[0] + '= pt[0]; o' + format[1] + '= pt[1]; return o;');
        return _getObj(pt);
    });
}

function _sortByX(pointset) {
    return pointset.sort(function(a, b) {
        if (a[0] == b[0]) {
            return a[1] - b[1];                           
        } else {                                                    
            return a[0] - b[0];                                                           
        }
    });
}

function _getMaxY(pointset) {
    var maxY = -Infinity;
    for (var i = pointset.length - 1; i >= 0; i--) {
        if (pointset[i][1] > maxY) {
            maxY = pointset[i][1];
        }
    }
    return maxY;
}

function _getMinY(pointset) {
    var minY = Infinity;
    for (var i = pointset.length - 1; i >= 0; i--) {
        if (pointset[i][1] < minY) {
        	minY = pointset[i][1];
        }
    }
    return minY;
}

function _upperTangent(pointset) {
    var lower = [];
    for (var l = 0; l < pointset.length; l++) {
        while (lower.length >= 2 && (_cross(lower[lower.length - 2], lower[lower.length - 1], pointset[l]) <= 0)) {
            lower.pop();
        }
        lower.push(pointset[l]);
    }
    lower.pop();
    return lower;
}

function _lowerTangent(pointset) {
    var reversed = pointset.reverse(),
        upper = [];
    for (var u = 0; u < reversed.length; u++) {
        while (upper.length >= 2 && (_cross(upper[upper.length - 2], upper[upper.length - 1], reversed[u]) <= 0)) {
            upper.pop();
        }
        upper.push(reversed[u]);
    }
    upper.pop();
    return upper;
}

function _cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); 
}

function _sqLength(a, b) {
    return Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2);
}


function toRad(n) {
    return n * Math.PI / 180;
}


function _sqLengthHaversine(a, b) {  
	var R = 6371000;
	
	var lat1 = a[0];
	var lat2 = b[0];
	
	var lon1 = a[1];
	var lon2 = b[1];
	
    var dLat = toRad(lat2 - lat1);
    var dLong = toRad(lon2 - lon1);
  
    var e = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLong / 2) * Math.sin(dLong / 2);
    var c = 2 * Math.atan2(Math.sqrt(e), Math.sqrt(1 - e));
    var d = R * c;
  
    return d;
}

function _cos(o, a, b) {
    var aShifted = [a[0] - o[0], a[1] - o[1]],
        bShifted = [b[0] - o[0], b[1] - o[1]],
        sqALen = _sqLength(o, a),
        sqBLen = _sqLength(o, b),
        dot = aShifted[0] * bShifted[0] + aShifted[1] * bShifted[1];

    return dot / Math.sqrt(sqALen * sqBLen);
}

function _intersect(segment, pointset) {
    for (var i = 0; i < pointset.length - 1; i++) {
        var seg = [pointset[i], pointset[i + 1]];
        if (segment[0][0] === seg[0][0] && segment[0][1] === seg[0][1] ||
            segment[0][0] === seg[1][0] && segment[0][1] === seg[1][1]) {
            continue;
        }
        if (intersect(segment, seg)) {
            return true;
        }
    }
    return false;
}

function _bBoxAround(edge, boxSize) {
    var minX, maxX, minY, maxY;

    if (edge[0][0] < edge[1][0]) {
        minX = edge[0][0] - boxSize;
        maxX = edge[1][0] + boxSize;
    } else {
        minX = edge[1][0] - boxSize;
        maxX = edge[0][0] + boxSize;
    }

    if (edge[0][1] < edge[1][1]) {
        minY = edge[0][1] - boxSize;
        maxY = edge[1][1] + boxSize;
    } else {
        minY = edge[1][1] - boxSize;
        maxY = edge[0][1] + boxSize;
    }

    return [
        minX, minY, // tl
        maxX, maxY  // br
    ];
}

function _midPoint(edge, innerPoints, convex) {
    var point = null,
        angle1Cos = MAX_CONCAVE_ANGLE_COS,
        angle2Cos = MAX_CONCAVE_ANGLE_COS,
        a1Cos, a2Cos;

    for (var i = 0; i < innerPoints.length; i++) {
        a1Cos = _cos(edge[0], edge[1], innerPoints[i]);
        a2Cos = _cos(edge[1], edge[0], innerPoints[i]);

        if (a1Cos > angle1Cos && a2Cos > angle2Cos &&
            !_intersect([edge[0], innerPoints[i]], convex) &&
            !_intersect([edge[1], innerPoints[i]], convex)) {

            angle1Cos = a1Cos;
            angle2Cos = a2Cos;
            point = innerPoints[i];
        }
    }

    return point;
}

function _concave(convex, maxSqEdgeLen, maxSearchBBoxSize, grid, edgeLenOnGlobe) {
    var edge,
        border,
        bBoxSize,
        midPoint,
        bBoxAround,    
        midPointInserted = false;

    for (var i = 0; i < convex.length - 1; i++) {
        edge = [convex[i], convex[i + 1]];

        if(edgeLenOnGlobe){
        	if (_sqLengthHaversine(edge[0], edge[1]) < maxSqEdgeLen) { continue; }
        }else{
        	if (_sqLength(edge[0], edge[1]) < maxSqEdgeLen) { continue; }
        }
        

        border = 0;
        bBoxSize = MIN_SEARCH_BBOX_SIZE;
        bBoxAround = _bBoxAround(edge, bBoxSize);
        do {
            bBoxAround = grid.addBorder2Bbox(bBoxAround, border);
            bBoxSize = bBoxAround[2] - bBoxAround[0];
            midPoint = _midPoint(edge, grid.rangePoints(bBoxAround), convex);            
            border++;
        }  while (midPoint === null && maxSearchBBoxSize > bBoxSize);

        if (midPoint !== null) {
            convex.splice(i + 1, 0, midPoint);
            grid.removePoint(midPoint);
            midPointInserted = true;
        }
    }

    if (midPointInserted) {
        return _concave(convex, maxSqEdgeLen, maxSearchBBoxSize, grid);
    }

    return convex;
}

function hull(pointset, concavity, format, edgeLenOnGlobe) {
    var lower, upper, convex,
        innerPoints,
        maxSearchBBoxSize,
        maxEdgeLen = concavity || 20;

    if (pointset.length < 4) {
        return pointset;
    }

    pointset = _sortByX(_formatToXy(pointset, format));
    upper = _upperTangent(pointset);
    lower = _lowerTangent(pointset);
    convex = lower.concat(upper);
    convex.push(pointset[0]);
    
    if(edgeLenOnGlobe){
    	maxSearchBBoxSize = _sqLengthHaversine([0,_getMinY(pointset)], [0,_getMaxY(pointset)]) * MAX_SEARCH_BBOX_SIZE_PERCENT;
    }else{
        maxSearchBBoxSize = Math.max(pointset[pointset.length - 1][0], _getMaxY(convex)) * MAX_SEARCH_BBOX_SIZE_PERCENT;
    }
    innerPoints = pointset.filter(function(pt) {
        return convex.indexOf(pt) < 0;
    });
 
    if(!edgeLenOnGlobe){
    	maxEdgeLen = Math.pow(maxEdgeLen, 2);
    }
    return _xyToFormat(_concave(convex, maxEdgeLen, maxSearchBBoxSize, grid(innerPoints), edgeLenOnGlobe), format);
}

var MAX_CONCAVE_ANGLE_COS = Math.cos(90 / (180 / Math.PI)); // angle = 90 deg
var MIN_SEARCH_BBOX_SIZE = 5;
var MAX_SEARCH_BBOX_SIZE_PERCENT = 0.8;

module.exports = hull;