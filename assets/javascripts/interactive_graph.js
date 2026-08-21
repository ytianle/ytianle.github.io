/* Renderer for mkdocs-obsidian-interactive-graph-plugin. */
(function () {
  'use strict';

  var graphData = null;
  var localChart = null;
  var globalChart = null;
  var globalContainer = null;
  var gardenNavigationToken = 0;
  var globalLayoutCache = null;
  var globalLayoutStorageKey = 'digital-garden-global-layout-v4';

  function graphLayoutSignature() {
    return graphData.nodes.map(function (node) { return node.id; }).sort().join('|') +
      ':' + graphData.links.length;
  }

  function loadGlobalLayout() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(globalLayoutStorageKey));
      if (saved && saved.signature === graphLayoutSignature() && saved.positions) {
        globalLayoutCache = saved.positions;
      }
    } catch (error) {
      globalLayoutCache = null;
    }
  }

  function hasCompleteGlobalLayout() {
    return Boolean(globalLayoutCache) && graphData.nodes.every(function (node) {
      var point = globalLayoutCache[node.id];
      return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
    });
  }

  function saveGlobalLayout(chart) {
    if (!chart || chart.isDisposed()) return;
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data || !data.count()) return;
    var positions = {};
    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var screenPoint = node && nodeCenter(chart, node.id);
      var point = screenPoint && chart.convertFromPixel({ seriesIndex: 0 }, screenPoint);
      if (!Array.isArray(point)) point = data.getItemLayout(index);
      if (!node || !Array.isArray(point) ||
          !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      positions[node.id] = [point[0], point[1]];
    }
    globalLayoutCache = positions;
    try {
      sessionStorage.setItem(globalLayoutStorageKey, JSON.stringify({
        signature: graphLayoutSignature(),
        positions: positions
      }));
    } catch (error) {
      // The in-memory layout still avoids redraws during instant navigation.
    }
  }

  function palette() {
    var scheme = document.body.getAttribute('data-md-color-scheme') ||
      document.documentElement.getAttribute('data-md-color-scheme');
    var dark = scheme === 'slate';
    return dark ? {
      current: '#e59a78',
      parent: '#a998d4',
      child: '#67b4a2',
      sibling: '#aab2bf',
      other: '#8ea3d0',
      text: '#f4f6fb',
      border: '#252a35',
      line: '#8ea3d0',
      trunk: '#9a3f4b',
      hoverBorder: '#d4bea4',
      hoverLine: '#d9dce2',
      hoverBlurNode: 0.13,
      hoverBlurEdge: 0.045,
      mutedNodeOpacity: 0.34,
      mutedEdgeOpacity: 0.13
    } : {
      current: '#d97757',
      parent: '#756bb1',
      child: '#3a8d7d',
      sibling: '#8a94a3',
      other: '#6e83b7',
      text: '#252a34',
      border: '#ffffff',
      line: '#6e83b7',
      trunk: '#7f2634',
      hoverBorder: '#a98e70',
      hoverLine: '#17191d',
      hoverBlurNode: 0.16,
      hoverBlurEdge: 0.055,
      mutedNodeOpacity: 0.42,
      mutedEdgeOpacity: 0.16
    };
  }

  function normalizePath(value) {
    var path = new URL(value, window.location.origin).pathname || '/';
    return path.endsWith('/') || path.split('/').pop().includes('.') ? path : path + '/';
  }

  function currentNode() {
    var path = normalizePath(window.location.pathname);
    return graphData.nodes.find(function (node) {
      return normalizePath(node.value) === path;
    });
  }

  function hierarchyLinks() {
    return graphData.links.filter(function (link) { return link.kind === 'hierarchy'; });
  }

  function relationContext() {
    var current = currentNode();
    var result = { parents: new Set(), children: new Set(), siblings: new Set() };
    if (!current) return result;

    var links = hierarchyLinks();
    links.forEach(function (link) {
      if (link.target === current.id) result.parents.add(link.source);
      if (link.source === current.id) result.children.add(link.target);
    });
    links.forEach(function (link) {
      if (result.parents.has(link.source) && link.target !== current.id) {
        result.siblings.add(link.target);
      }
    });
    return result;
  }

  function relation(node, context) {
    var current = currentNode();
    if (current && node.id === current.id) return 'current';
    if (context.parents.has(node.id)) return 'parent';
    if (context.children.has(node.id)) return 'child';
    if (context.siblings.has(node.id)) return 'sibling';
    return 'other';
  }

  function descendantCounts() {
    var children = new Map();
    hierarchyLinks().forEach(function (link) {
      if (!children.has(link.source)) children.set(link.source, []);
      children.get(link.source).push(link.target);
    });
    var memo = new Map();

    function count(id, visiting) {
      if (memo.has(id)) return memo.get(id);
      if (visiting.has(id)) return 0;
      var nextVisiting = new Set(visiting);
      nextVisiting.add(id);
      var descendants = new Set();
      (children.get(id) || []).forEach(function (child) {
        descendants.add(child);
        count(child, nextVisiting);
        (children.get(child) || []).forEach(function (grandchild) { descendants.add(grandchild); });
      });
      var total = (children.get(id) || []).reduce(function (sum, child) {
        return sum + 1 + count(child, nextVisiting);
      }, 0);
      memo.set(id, total);
      return total;
    }

    graphData.nodes.forEach(function (node) { count(node.id, new Set()); });
    return memo;
  }

  function homeHierarchyDepths() {
    var depths = new Map();
    var home = graphData.nodes.find(function (node) {
      return normalizePath(node.value) === '/';
    });
    if (!home) return depths;
    var children = new Map();
    hierarchyLinks().forEach(function (link) {
      if (!children.has(link.source)) children.set(link.source, []);
      children.get(link.source).push(link.target);
    });
    var queue = [home.id];
    depths.set(home.id, 0);
    while (queue.length) {
      var id = queue.shift();
      (children.get(id) || []).forEach(function (child) {
        if (depths.has(child)) return;
        depths.set(child, depths.get(id) + 1);
        queue.push(child);
      });
    }
    return depths;
  }

  function graphDistances() {
    var current = currentNode();
    var distances = new Map();
    if (!current) return distances;
    var neighbors = new Map();
    hierarchyLinks().forEach(function (link) {
      if (!neighbors.has(link.source)) neighbors.set(link.source, []);
      if (!neighbors.has(link.target)) neighbors.set(link.target, []);
      neighbors.get(link.source).push(link.target);
      neighbors.get(link.target).push(link.source);
    });
    var queue = [current.id];
    distances.set(current.id, 0);
    while (queue.length) {
      var id = queue.shift();
      (neighbors.get(id) || []).forEach(function (neighbor) {
        if (distances.has(neighbor)) return;
        distances.set(neighbor, distances.get(id) + 1);
        queue.push(neighbor);
      });
    }
    return distances;
  }

  function currentDescendants() {
    var current = currentNode();
    var result = new Set();
    if (!current) return result;
    var children = new Map();
    hierarchyLinks().forEach(function (link) {
      if (!children.has(link.source)) children.set(link.source, []);
      children.get(link.source).push(link.target);
    });
    var stack = (children.get(current.id) || []).slice();
    while (stack.length) {
      var id = stack.pop();
      if (result.has(id)) continue;
      result.add(id);
      (children.get(id) || []).forEach(function (child) { stack.push(child); });
    }
    return result;
  }

  function fogNodeOpacity(depth, kind) {
    if (kind !== 'other') return 1;
    if (depth <= 2) return 0.86;
    if (depth === 3) return 0.64;
    if (depth === 4) return 0.44;
    return 0.27;
  }

  function fogEdgeOpacity(depth, local) {
    if (local) return 0.48;
    if (depth <= 1) return 0.56;
    if (depth === 2) return 0.32;
    if (depth === 3) return 0.18;
    if (depth === 4) return 0.1;
    return 0.055;
  }

  function nodeSize(descendants, local) {
    var size = 9 + Math.log2(descendants + 1) * (local ? 2.7 : 3.6);
    return Math.min(local ? 28 : 40, size);
  }

  function labelHierarchy(node, local) {
    var minimum = 9;
    var maximum = local ? 28 : 40;
    var size = Number(node && node.symbolSize || minimum);
    var weight = Math.max(0, Math.min(1, (size - minimum) / (maximum - minimum)));
    return {
      scale: 0.86 + weight * 0.48,
      opacity: 0.48 + weight * 0.52,
      fontWeight: Math.round((400 + weight * 300) / 50) * 50
    };
  }

  function graphParts(local) {
    var current = currentNode();
    var context = relationContext();
    var colors = palette();
    var counts = descendantCounts();
    var hierarchyDepths = homeHierarchyDepths();
    var distances = graphDistances();
    var descendants = currentDescendants();
    var reuseGlobalLayout = !local && hasCompleteGlobalLayout();
    var visible = null;

    if (local && current) {
      visible = new Set([current.id]);
      context.parents.forEach(function (id) { visible.add(id); });
      context.children.forEach(function (id) { visible.add(id); });
      context.siblings.forEach(function (id) { visible.add(id); });
    }

    var ranks = new Map();
    graphData.nodes.slice().sort(function (left, right) {
      return (hierarchyDepths.get(left.id) ?? 99) - (hierarchyDepths.get(right.id) ?? 99) ||
        (counts.get(right.id) || 0) - (counts.get(left.id) || 0) ||
        String(left.name).localeCompare(String(right.name));
    }).forEach(function (node, index) {
      ranks.set(node.id, index);
    });

    var nodes = graphData.nodes.filter(function (node) {
      return !visible || visible.has(node.id);
    }).map(function (node) {
      var kind = relation(node, context);
      var depth = distances.has(node.id) ? distances.get(node.id) : 99;
      var descendantCount = counts.get(node.id) || 0;
      var size = nodeSize(descendantCount, local);
      var hierarchy = labelHierarchy({ symbolSize: size }, local);
      var copy = Object.assign({}, node, {
        symbolSize: size,
        gardenMass: 1 + Math.log2(descendantCount + 1),
        labelRank: ranks.get(node.id),
        hierarchyDepth: hierarchyDepths.get(node.id) ?? 99,
        relation: kind,
        graphDepth: depth,
        isDescendant: descendants.has(node.id),
        label: {
          opacity: local ? hierarchy.opacity : Math.max(
            0.34,
            hierarchy.opacity * fogNodeOpacity(depth, kind)
          ),
          fontSize: (local ? 10 : 11) * hierarchy.scale,
          fontWeight: hierarchy.fontWeight
        },
        itemStyle: {
          color: colors[kind],
          borderColor: colors.border,
          borderWidth: 1.2,
          shadowBlur: local ? 5 : 0,
          shadowColor: 'rgba(24, 32, 48, .12)',
          opacity: local ? 1 : fogNodeOpacity(depth, kind)
        }
      });
      if (reuseGlobalLayout) {
        copy.x = globalLayoutCache[node.id][0];
        copy.y = globalLayoutCache[node.id][1];
      }
      return copy;
    });

    var visibleIds = new Set(nodes.map(function (node) { return node.id; }));
    var links = graphData.links.filter(function (link) {
      return visibleIds.has(link.source) && visibleIds.has(link.target);
    }).map(function (link) {
      var sourceDepth = distances.has(link.source) ? distances.get(link.source) : 99;
      var targetDepth = distances.has(link.target) ? distances.get(link.target) : 99;
      var isTrunk = link.kind === 'hierarchy' && current && (
        link.source === current.id ||
        link.target === current.id ||
        (descendants.has(link.source) && descendants.has(link.target))
      );
      return Object.assign({}, link, {
        lineStyle: {
          color: isTrunk ? colors.trunk : colors.line,
          width: isTrunk ? (local ? 2.2 : 1.8) : 1.1,
          curveness: isTrunk ? 0.018 : (link.kind === 'hierarchy' ? 0.035 : 0.055),
          opacity: isTrunk
            ? (local ? 0.82 : 0.68)
            : fogEdgeOpacity(Math.min(sourceDepth, targetDepth), local)
        }
      });
    });
    return { nodes: nodes, links: links };
  }

  function nodeCenter(chart, nodeId) {
    var series = chart.getModel().getSeriesByIndex(0);
    if (!series) return null;
    var data = series.getData();
    for (var index = 0; index < data.count(); index += 1) {
      if (data.getRawDataItem(index).id !== nodeId) continue;
      var element = symbolElement(data.getItemGraphicEl(index));
      if (!element || !element.getBoundingRect || !element.transformCoordToGlobal) return null;
      var box = element.getBoundingRect();
      return element.transformCoordToGlobal(
        box.x + box.width / 2,
        box.y + box.height / 2
      );
    }
    return null;
  }

  function centerNode(chart, nodeId) {
    var point = nodeCenter(chart, nodeId);
    if (!point) return false;
    var dx = chart.getWidth() / 2 - point[0];
    var dy = chart.getHeight() / 2 - point[1];
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return true;
    chart.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      dx: dx,
      dy: dy
    });
    return true;
  }

  function fitGlobalOverview(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    var state = chart.__graphState;
    var home = graphData.nodes.find(function (node) {
      return normalizePath(node.value) === '/';
    });
    var homeCenter = home && nodeCenter(chart, home.id);
    if (!data || !state || !homeCenter) return;

    var horizontalExtent = 40;
    var verticalExtent = 40;
    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var center = node && nodeCenter(chart, node.id);
      if (!center) continue;
      horizontalExtent = Math.max(horizontalExtent, Math.abs(center[0] - homeCenter[0]));
      verticalExtent = Math.max(verticalExtent, Math.abs(center[1] - homeCenter[1]));
    }
    var fitFactor = Math.min(
      (chart.getWidth() - 64) / (horizontalExtent * 2),
      (chart.getHeight() - 64) / (verticalExtent * 2)
    );
    var targetZoom = Math.max(0.35, Math.min(1.8, state.zoom * fitFactor));
    chart.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: targetZoom / state.zoom,
      originX: homeCenter[0],
      originY: homeCenter[1]
    });
    centerNode(chart, home.id);
    state.overviewZoom = targetZoom;
    updateGlobalLabels(chart, state.zoom, state.showChildren);
  }

  function symbolElement(element) {
    if (!element) return null;
    if (typeof element.getSymbolPath === 'function') return element.getSymbolPath();
    if (typeof element.childAt === 'function' && element.childAt(0)) return element.childAt(0);
    return element;
  }

  function edgeElement(element) {
    if (!element) return null;
    if (typeof element.getLinePath === 'function') return element.getLinePath();
    if (element.style && typeof element.setStyle === 'function') return element;
    if (typeof element.childAt === 'function') {
      for (var index = 0; index < element.childCount(); index += 1) {
        var child = edgeElement(element.childAt(index));
        if (child) return child;
      }
    }
    return null;
  }

  function silenceLabels(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    if (!series) return;
    var data = series.getData();
    for (var index = 0; index < data.count(); index += 1) {
      var element = symbolElement(data.getItemGraphicEl(index));
      var label = element && element.getTextContent && element.getTextContent();
      if (label) label.silent = true;
    }
  }

  function globalLabelLimit(zoom, total) {
    var progress = Math.max(0, Math.min(1, (zoom - 0.55) / 2.75));
    return Math.min(total, Math.round(12 + (total - 12) * Math.pow(progress, 1.65)));
  }

  function globalLabelSize(zoom) {
    return Math.min(17, Math.round((11.5 + Math.sqrt(zoom) * 2) * 2) / 2);
  }

  function updateGlobalLabels(chart, zoom, showChildren) {
    var series = chart.getModel().getSeriesByIndex(0);
    if (!series) return;
    var data = series.getData();
    var limit = globalLabelLimit(zoom, data.count());
    var baseFontSize = globalLabelSize(zoom);
    var changed = false;

    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var element = symbolElement(data.getItemGraphicEl(index));
      var label = element && element.getTextContent && element.getTextContent();
      if (!node || !label) continue;
      label.silent = true;
      var inFocusedBranch = node.relation === 'current' || node.isDescendant;
      var pinnedLabel = node.relation === 'current' ||
        (showChildren && node.isDescendant);
      var hidden = (chart.__graphState.focusBranch && !inFocusedBranch) ||
        (!pinnedLabel && Number(node.labelRank) >= limit);
      var hierarchy = labelHierarchy(node, false);
      var fontSize = Math.round(baseFontSize * hierarchy.scale * 2) / 2;
      var fontWeight = node.relation === 'current'
        ? 700
        : hierarchy.fontWeight;
      var opacity = node.relation === 'current'
        ? 1
        : Math.max(0.3, hierarchy.opacity * fogNodeOpacity(node.graphDepth, node.relation));
      if (chart.__relationshipHoverIds) {
        hidden = !chart.__relationshipHoverIds.has(node.id);
        opacity = hidden ? 0 : 1;
      }
      if (label.ignore !== hidden) {
        label.ignore = hidden;
        label.markRedraw();
        changed = true;
      }
      if (label.style.fontSize !== fontSize ||
          label.style.fontWeight !== fontWeight ||
          label.style.opacity !== opacity) {
        label.setStyle({
          fontSize: fontSize,
          fontWeight: fontWeight,
          opacity: opacity
        });
        changed = true;
      }
    }
    if (changed) chart.getZr().refresh();
  }

  function focusCurrentBranch(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    if (!series) return;
    var data = series.getData();
    var focusedIds = new Set();
    var colors = palette();
    var muted = colors.sibling;

    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var element = symbolElement(data.getItemGraphicEl(index));
      if (!node || !element) continue;
      var focused = node.relation === 'current' || node.isDescendant;
      if (focused) focusedIds.add(node.id);
      if (!element.__gardenOriginalStyle) {
        element.__gardenOriginalStyle = {
          fill: element.style.fill,
          stroke: element.style.stroke,
          opacity: element.style.opacity
        };
      }
      if (focused) {
        element.setStyle(element.__gardenOriginalStyle);
      } else {
        element.setStyle({
          fill: muted,
          stroke: muted,
          opacity: colors.mutedNodeOpacity
        });
      }
    }

    var edges = series.getEdgeData && series.getEdgeData();
    if (edges) {
      for (var edgeIndex = 0; edgeIndex < edges.count(); edgeIndex += 1) {
        var link = edges.getRawDataItem(edgeIndex);
        var edge = edgeElement(edges.getItemGraphicEl(edgeIndex));
        if (!link || !edge) continue;
        if (!edge.__gardenOriginalStyle) {
          edge.__gardenOriginalStyle = {
            stroke: edge.style.stroke,
            opacity: edge.style.opacity,
            lineWidth: edge.style.lineWidth
          };
        }
        if (focusedIds.has(link.source) && focusedIds.has(link.target)) {
          edge.setStyle(edge.__gardenOriginalStyle);
        } else {
          edge.setStyle({ stroke: muted, opacity: colors.mutedEdgeOpacity });
        }
      }
    }

    chart.__graphState.focusBranch = true;
    chart.__graphState.focusVisualApplied = true;
    updateGlobalLabels(chart, chart.__graphState.zoom, chart.__graphState.showChildren);
    chart.getZr().refresh();
  }

  function clearCurrentBranchFocus(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    if (!series) return;
    var data = series.getData();

    for (var index = 0; index < data.count(); index += 1) {
      var element = symbolElement(data.getItemGraphicEl(index));
      if (!element || !element.__gardenOriginalStyle) continue;
      element.setStyle(element.__gardenOriginalStyle);
    }

    var edges = series.getEdgeData && series.getEdgeData();
    if (edges) {
      for (var edgeIndex = 0; edgeIndex < edges.count(); edgeIndex += 1) {
        var edge = edgeElement(edges.getItemGraphicEl(edgeIndex));
        if (!edge || !edge.__gardenOriginalStyle) continue;
        edge.setStyle(edge.__gardenOriginalStyle);
      }
    }

    chart.__graphState.focusBranch = false;
    chart.__graphState.focusVisualApplied = false;
    updateGlobalLabels(chart, chart.__graphState.zoom, chart.__graphState.showChildren);
    chart.getZr().refresh();
  }

  function nodeAtPoint(chart, event) {
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data) return null;

    for (var index = data.count() - 1; index >= 0; index -= 1) {
      var element = symbolElement(data.getItemGraphicEl(index));
      if (!element || !element.getBoundingRect || !element.transformCoordToGlobal) continue;
      var box = element.getBoundingRect();
      var center = element.transformCoordToGlobal(
        box.x + box.width / 2,
        box.y + box.height / 2
      );
      var edge = element.transformCoordToGlobal(box.x + box.width, box.y + box.height / 2);
      var radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
      var dx = event.offsetX - center[0];
      var dy = event.offsetY - center[1];
      if (dx * dx + dy * dy <= radius * radius) {
        return data.getRawDataItem(index);
      }
    }
    return null;
  }

  function currentNodeGeometry(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data) return null;
    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      if (!node || node.relation !== 'current') continue;
      var element = symbolElement(data.getItemGraphicEl(index));
      if (!element || !element.getBoundingRect || !element.transformCoordToGlobal) return null;
      var box = element.getBoundingRect();
      var center = element.transformCoordToGlobal(
        box.x + box.width / 2,
        box.y + box.height / 2
      );
      var edge = element.transformCoordToGlobal(box.x + box.width, box.y + box.height / 2);
      return {
        x: center[0],
        y: center[1],
        radius: Math.hypot(edge[0] - center[0], edge[1] - center[1])
      };
    }
    return null;
  }

  function updateCurrentRipple(chart) {
    if (!chart.__graphRipple) return;
    var geometry = currentNodeGeometry(chart);
    if (!geometry) return;
    var color = palette().current;
    chart.__graphRipple.forEach(function (ring) {
      ring.setShape({ cx: geometry.x, cy: geometry.y });
      ring.setStyle({ stroke: color });
    });
  }

  function startCurrentRipple(chart) {
    if (chart.__graphRipple) return;
    var geometry = currentNodeGeometry(chart);
    if (!geometry || !echarts.graphic || !echarts.graphic.Circle) return;
    var rings = [];
    for (var index = 0; index < 3; index += 1) {
      var ring = new echarts.graphic.Circle({
        silent: true,
        z: 1,
        shape: { cx: geometry.x, cy: geometry.y, r: geometry.radius + 2 },
        style: {
          fill: null,
          stroke: palette().current,
          lineWidth: 1.35,
          opacity: 0.52
        }
      });
      chart.getZr().add(ring);
      ring.animate('shape', true)
        .delay(index * 620)
        .when(1860, { r: geometry.radius + 25 })
        .start('cubicOut');
      ring.animate('style', true)
        .delay(index * 620)
        .when(1860, { opacity: 0 })
        .start('cubicOut');
      rings.push(ring);
    }
    chart.__graphRipple = rings;
  }

  function chartOption(local) {
    var parts = graphParts(local);
    var colors = palette();
    var reuseGlobalLayout = !local && hasCompleteGlobalLayout();
    return {
      darkMode: 'auto',
      animation: true,
      animationDurationUpdate: 280,
      animationEasingUpdate: 'cubicOut',
      // Let the graph sit naturally in the sidebar, like the surrounding blog UI.
      backgroundColor: 'transparent',
      tooltip: { show: false },
      series: [{
        name: 'Interactive Graph',
        type: 'graph',
        layout: 'force',
        data: parts.nodes,
        links: parts.links,
        zoom: local ? 1 : 0.62,
        roam: false,
        draggable: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}',
          color: colors.text,
          fontSize: local ? 9 : 10,
          distance: 3
        },
        emphasis: {
          disabled: true,
          focus: 'none',
          scale: false
        },
        labelLayout: { hideOverlap: true },
        scaleLimit: local ? { min: 0.5, max: 5 } : { min: 0.15, max: 8 },
        lineStyle: { color: colors.line, width: 1.1, opacity: 0.24, curveness: 0 },
        force: reuseGlobalLayout ? {
          initLayout: 'none',
          repulsion: 145,
          edgeLength: [42, 82],
          gravity: 0.05,
          layoutAnimation: true
        } : local ? {
          repulsion: 170,
          edgeLength: 82,
          gravity: 0.075,
          layoutAnimation: true
        } : {
          repulsion: 145,
          edgeLength: [42, 82],
          gravity: 0.05,
          layoutAnimation: true
        }
      }]
    };
  }

  function preserveCurrentNodeColor(chart) {
    var current = currentNode();
    if (!current || !chart || chart.isDisposed()) return;
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data) return;
    var colors = palette();
    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      if (!node || node.id !== current.id) continue;
      var element = symbolElement(data.getItemGraphicEl(index));
      if (element) {
        element.setStyle({
          fill: colors.current,
          stroke: colors.border,
          opacity: 1
        });
      }
      return;
    }
  }

  function installNodeMassResistance(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data) return;

    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var graphic = data.getItemGraphicEl(index);
      if (!node || !graphic || graphic.__gardenMassResistance ||
          typeof graphic.drift !== 'function') continue;
      var originalDrift = graphic.drift;
      var mass = Math.max(1, Number(node.gardenMass || 1));
      // Continuous resistance: a leaf follows the pointer almost exactly,
      // while a large branch moves less per pointer delta but never locks.
      var response = 1 / (1 + (mass - 1) * 0.18);
      graphic.drift = (function (drift, factor) {
        return function (dx, dy, event) {
          return drift.call(this, dx * factor, dy * factor, event);
        };
      })(originalDrift, response);
      (function (target) {
        if (!target.on) return;
        target.on('dragstart', function () {
          chart.__nodeDragging = true;
          restoreRelationshipHover(chart);
        });
        target.on('dragend', function () {
          chart.__nodeDragging = false;
        });
      })(graphic);
      graphic.__gardenMassResistance = true;
      graphic.__gardenMassResponse = response;
    }
  }

  function restoreRelationshipHover(chart) {
    (chart.__relationshipHoverStyles || []).forEach(function (entry) {
      if (!entry.element || !entry.element.setStyle) return;
      entry.element.setStyle(entry.style);
      if (Object.prototype.hasOwnProperty.call(entry, 'ignore')) {
        entry.element.ignore = entry.ignore;
        if (entry.element.markRedraw) entry.element.markRedraw();
      }
    });
    chart.__relationshipHoverStyles = [];
    chart.__relationshipHoverNode = null;
    chart.__relationshipHoverIds = null;
    if (chart.getZr) chart.getZr().refresh();
  }

  function rememberHoverStyle(chart, element, keys) {
    if (!element || !element.style || !element.setStyle) return;
    var snapshot = {};
    keys.forEach(function (key) { snapshot[key] = element.style[key]; });
    chart.__relationshipHoverStyles.push({ element: element, style: snapshot });
  }

  function rememberHoverLabel(chart, label) {
    if (!label || !label.style || !label.setStyle) return;
    chart.__relationshipHoverStyles.push({
      element: label,
      style: { opacity: label.style.opacity },
      ignore: label.ignore
    });
  }

  function focusNodeRelationships(chart, nodeId) {
    if (!nodeId || chart.__relationshipHoverNode === nodeId) return;
    restoreRelationshipHover(chart);
    chart.__relationshipHoverNode = nodeId;
    chart.__relationshipHoverStyles = [];
    var colors = palette();
    var related = new Set([nodeId]);
    graphData.links.forEach(function (link) {
      if (link.source === nodeId) related.add(link.target);
      if (link.target === nodeId) related.add(link.source);
    });
    chart.__relationshipHoverIds = related;
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    var edgeData = series && series.getEdgeData();
    if (!data || !edgeData) return;

    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var graphic = data.getItemGraphicEl(index);
      var symbol = symbolElement(graphic);
      if (!node || !symbol) continue;
      rememberHoverStyle(chart, symbol, ['opacity', 'stroke', 'lineWidth']);
      var isRelated = related.has(node.id);
      symbol.setStyle({
        opacity: isRelated ? 1 : colors.hoverBlurNode,
        stroke: node.id === nodeId ? colors.hoverBorder : symbol.style.stroke,
        lineWidth: node.id === nodeId ? 1.55 : symbol.style.lineWidth
      });
      var label = symbol.getTextContent && symbol.getTextContent();
      if (label) {
        rememberHoverLabel(chart, label);
        label.ignore = !isRelated;
        label.setStyle({ opacity: isRelated ? 1 : 0 });
        if (label.markRedraw) label.markRedraw();
      }
    }

    for (var edgeIndex = 0; edgeIndex < edgeData.count(); edgeIndex += 1) {
      var edge = edgeData.getRawDataItem(edgeIndex);
      var edgeGraphic = edgeElement(edgeData.getItemGraphicEl(edgeIndex));
      if (!edge || !edgeGraphic) continue;
      var connected = edge.source === nodeId || edge.target === nodeId;
      rememberHoverStyle(chart, edgeGraphic, ['opacity', 'stroke', 'lineWidth']);
      edgeGraphic.setStyle({
        opacity: connected ? 0.76 : colors.hoverBlurEdge,
        stroke: connected ? colors.hoverLine : edgeGraphic.style.stroke,
        lineWidth: connected ? 1.8 : edgeGraphic.style.lineWidth
      });
    }
    chart.getZr().refresh();
  }

  function bindChart(chart, local) {
    var state = {
      zoom: local ? 1 : 0.62,
      showChildren: false,
      focusBranch: false,
      focusVisualApplied: false,
      reusedLayout: !local && hasCompleteGlobalLayout(),
      overviewFitted: false,
      overviewZoom: local ? 1 : 0.62
    };
    chart.__graphState = state;
    var chartElement = chart.getDom();
    var inertiaFrame = 0;
    var panVelocity = { x: 0, y: 0 };
    var zoomVelocity = 0;
    var zoomOrigin = { x: chart.getWidth() / 2, y: chart.getHeight() / 2 };

    function cancelInertia() {
      if (inertiaFrame) cancelAnimationFrame(inertiaFrame);
      inertiaFrame = 0;
      panVelocity.x = 0;
      panVelocity.y = 0;
      zoomVelocity = 0;
    }

    function runInertia() {
      if (inertiaFrame || chart.isDisposed()) return;
      var previousTime = performance.now();
      function glide(now) {
        if (chart.isDisposed()) return;
        var frameScale = Math.min(2, Math.max(0.5, (now - previousTime) / 16.67));
        previousTime = now;
        if (Math.abs(panVelocity.x) + Math.abs(panVelocity.y) > 0.08) {
          chart.dispatchAction({
            type: 'graphRoam',
            seriesIndex: 0,
            dx: panVelocity.x * frameScale,
            dy: panVelocity.y * frameScale
          });
          var panDecay = Math.pow(0.9, frameScale);
          panVelocity.x *= panDecay;
          panVelocity.y *= panDecay;
        } else {
          panVelocity.x = 0;
          panVelocity.y = 0;
        }
        if (Math.abs(zoomVelocity) > 0.0008) {
          var minZoom = local ? 0.5 : 0.15;
          var maxZoom = local ? 5 : 8;
          var factor = Math.exp(zoomVelocity * frameScale);
          var nextZoom = state.zoom * factor;
          if (nextZoom < minZoom || nextZoom > maxZoom) {
            factor = Math.max(minZoom, Math.min(maxZoom, nextZoom)) / state.zoom;
            zoomVelocity = 0;
          }
          if (Math.abs(factor - 1) > 0.0001) {
            chart.dispatchAction({
              type: 'graphRoam',
              seriesIndex: 0,
              zoom: factor,
              originX: zoomOrigin.x,
              originY: zoomOrigin.y
            });
          }
          zoomVelocity *= Math.pow(0.82, frameScale);
        } else {
          zoomVelocity = 0;
        }
        if (panVelocity.x || panVelocity.y || zoomVelocity) {
          inertiaFrame = requestAnimationFrame(glide);
        } else {
          inertiaFrame = 0;
        }
      }
      inertiaFrame = requestAnimationFrame(glide);
    }
    chart.__cancelRoamInertia = cancelInertia;
    chart.__pushZoomInertia = function (factor, originX, originY) {
      panVelocity.x = 0;
      panVelocity.y = 0;
      zoomOrigin.x = originX;
      zoomOrigin.y = originY;
      zoomVelocity = Math.max(-0.14, Math.min(
        0.14,
        zoomVelocity + Math.log(factor) * 0.42
      ));
      runInertia();
    };

    chartElement.addEventListener('wheel', function (event) {
      event.preventDefault();
      var bounds = chartElement.getBoundingClientRect();
      panVelocity.x = 0;
      panVelocity.y = 0;
      zoomOrigin.x = event.clientX - bounds.left;
      zoomOrigin.y = event.clientY - bounds.top;
      zoomVelocity = Math.max(-0.14, Math.min(
        0.14,
        zoomVelocity + (event.deltaY < 0 ? 0.052 : -0.052)
      ));
      runInertia();
    }, { passive: false });

    var pan = null;
    var suppressClickUntil = 0;
    chartElement.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var bounds = chartElement.getBoundingClientRect();
      var point = {
        offsetX: event.clientX - bounds.left,
        offsetY: event.clientY - bounds.top
      };
      var pressedNode = nodeAtPoint(chart, point);
      if (pressedNode) {
        return;
      }
      cancelInertia();
      pan = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        vx: 0,
        vy: 0,
        pointerId: event.pointerId
      };
      chartElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    chartElement.addEventListener('pointermove', function (event) {
      if (!pan || pan.pointerId !== event.pointerId) return;
      var dx = event.clientX - pan.x;
      var dy = event.clientY - pan.y;
      var now = performance.now();
      var timeScale = Math.min(2, Math.max(0.5, 16.67 / Math.max(1, now - pan.time)));
      if (Math.abs(dx) + Math.abs(dy) > 2) suppressClickUntil = Date.now() + 160;
      pan.vx = pan.vx * 0.35 + dx * timeScale * 0.65;
      pan.vy = pan.vy * 0.35 + dy * timeScale * 0.65;
      pan.x = event.clientX;
      pan.y = event.clientY;
      pan.time = now;
      chart.dispatchAction({ type: 'graphRoam', seriesIndex: 0, dx: dx, dy: dy });
      event.preventDefault();
    });
    function endPan(event) {
      if (!pan || pan.pointerId !== event.pointerId) return;
      if (chartElement.hasPointerCapture(event.pointerId)) {
        chartElement.releasePointerCapture(event.pointerId);
      }
      if (event.type === 'pointerup') {
        panVelocity.x = pan.vx;
        panVelocity.y = pan.vy;
      }
      pan = null;
      if (event.type === 'pointerup') runInertia();
    }
    chartElement.addEventListener('pointerup', endPan);
    chartElement.addEventListener('pointercancel', endPan);

    chart.getZr().on('click', function (event) {
      if (Date.now() < suppressClickUntil) return;
      var node = nodeAtPoint(chart, event);
      if (!node || !node.value) return;
      if (!local && chart === globalChart) {
        selectGardenNode(chart, node);
      } else {
        window.location.assign(node.value);
      }
    });
    chart.on('mouseover', function (event) {
      if (chart.__nodeDragging || !event || event.dataType !== 'node' || !event.data) return;
      focusNodeRelationships(chart, event.data.id);
    });
    chart.on('mouseout', function (event) {
      if (!event || event.dataType !== 'node') return;
      restoreRelationshipHover(chart);
    });
    var centered = false;
    chart.on('rendered', function () {
      if (!local) {
        updateCurrentRipple(chart);
        preserveCurrentNodeColor(chart);
        if (state.reusedLayout && !state.overviewFitted) {
          state.overviewFitted = true;
          requestAnimationFrame(function () {
            if (!chart.isDisposed()) fitGlobalOverview(chart);
          });
        }
        window.clearTimeout(chart.__layoutSaveTimer);
        chart.__globalLayoutStable = false;
        chart.__layoutSaveTimer = window.setTimeout(function () {
          if (!chart.isDisposed()) {
            saveGlobalLayout(chart);
            chart.__globalLayoutStable = true;
          }
        }, 900);
      }
      if (!local && state.focusBranch && !state.focusVisualApplied) {
        focusCurrentBranch(chart);
      }
      if (!chart.__graphLabelsSilenced) {
        silenceLabels(chart);
        chart.__graphLabelsSilenced = true;
      }
      if (!local) updateGlobalLabels(chart, state.zoom, state.showChildren);
    });
    chart.on('graphroam', function (event) {
      if (!event || !event.zoom) return;
      state.zoom = Math.max(local ? 0.5 : 0.15, Math.min(local ? 5 : 8, state.zoom * event.zoom));
      if (!local && !state.animatingAnchor) {
        updateGlobalLabels(chart, state.zoom, state.showChildren);
      }
    });
    chart.on('finished', function () {
      installNodeMassResistance(chart);
      if (!local) {
        startCurrentRipple(chart);
      }
      if (centered) return;
      var target = local ? currentNode() : graphData.nodes.find(function (node) {
        return normalizePath(node.value) === '/';
      });
      if (target && centerNode(chart, target.id)) centered = true;
    });
  }

  function initChart(container, local) {
    var chart = echarts.init(container, null, { renderer: 'canvas', useDirtyRect: false });
    chart.__graphLabelsSilenced = false;
    bindChart(chart, local);
    chart.setOption(chartOption(local));
    return chart;
  }

  function addGraphDiv() {
    // Journal owns the secondary sidebar with its chronological world tree.
    // Do not turn that space into the Garden Map minimap.
    if (window.location.pathname === '/blog' || window.location.pathname.indexOf('/blog/') === 0) {
      return null;
    }
    var sidebar = document.querySelector('.md-sidebar--secondary');
    if (!sidebar) return null;
    var old = sidebar.querySelector('#graph');
    if (old) old.remove();
    var graph = document.createElement('div');
    graph.id = 'graph';
    graph.className = 'graph';
    var target = sidebar.querySelector('.md-sidebar__inner') || sidebar;
    target.appendChild(graph);
    return graph;
  }

  function graphLogo() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V10.5m0 5-4.6-4.1M12 13l4.7-4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="6" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="7.5" r="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 21h7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }

  function zoomChart(chart, factor) {
    if (chart.__pushZoomInertia) {
      chart.__pushZoomInertia(factor, chart.getWidth() / 2, chart.getHeight() / 2);
      return;
    }
    chart.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: factor,
      originX: chart.getWidth() / 2,
      originY: chart.getHeight() / 2
    });
  }

  function currentBranchBounds(chart) {
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data) return null;

    var bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      if (!node || (node.relation !== 'current' && !node.isDescendant)) continue;
      var geometry = symbolElement(data.getItemGraphicEl(index));
      if (!geometry || !geometry.getBoundingRect || !geometry.transformCoordToGlobal) continue;
      var box = geometry.getBoundingRect();
      var topLeft = geometry.transformCoordToGlobal(box.x, box.y);
      var bottomRight = geometry.transformCoordToGlobal(box.x + box.width, box.y + box.height);
      bounds.left = Math.min(bounds.left, topLeft[0], bottomRight[0]);
      bounds.top = Math.min(bounds.top, topLeft[1], bottomRight[1]);
      bounds.right = Math.max(bounds.right, topLeft[0], bottomRight[0]);
      bounds.bottom = Math.max(bounds.bottom, topLeft[1], bottomRight[1]);
    }
    return Number.isFinite(bounds.left) ? bounds : null;
  }

  function smoothAnchorCurrent(chart) {
    if (chart.__cancelRoamInertia) chart.__cancelRoamInertia();
    var state = chart.__graphState;
    var bounds = currentBranchBounds(chart);
    if (!state || !bounds) return;

    // Use almost the whole canvas while retaining a small clipping margin.
    var availableWidth = Math.max(160, chart.getWidth() - 64);
    var availableHeight = Math.max(160, chart.getHeight() - 64);
    var branchWidth = Math.max(80, bounds.right - bounds.left);
    var branchHeight = Math.max(80, bounds.bottom - bounds.top);
    var fitFactor = Math.min(
      availableWidth / branchWidth,
      availableHeight / branchHeight
    );
    // Tiny branches need substantially more magnification than a large tree.
    // Keep a little headroom below the graph's hard scaleLimit (8).
    var targetZoom = Math.max(0.15, Math.min(6.5, state.zoom * fitFactor));
    var totalScale = targetZoom / state.zoom;
    var anchorX = (bounds.left + bounds.right) / 2;
    var anchorY = (bounds.top + bounds.bottom) / 2;
    var totalDx = chart.getWidth() / 2 - anchorX;
    var totalDy = chart.getHeight() / 2 - anchorY;
    focusCurrentBranch(chart);
    var startedAt = performance.now();
    var previousEase = 0;
    var previousScale = 1;
    state.animatingAnchor = true;
    chart.__anchorAnimation = (chart.__anchorAnimation || 0) + 1;
    var animationId = chart.__anchorAnimation;

    function frame(now) {
      if (animationId !== chart.__anchorAnimation || chart.isDisposed()) return;
      var progress = Math.min(1, (now - startedAt) / 760);
      var eased = 1 - Math.pow(1 - progress, 3);
      var scale = 1 + (totalScale - 1) * eased;
      chart.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        zoom: scale / previousScale,
        originX: anchorX + totalDx * previousEase,
        originY: anchorY + totalDy * previousEase
      });
      chart.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        dx: totalDx * (eased - previousEase),
        dy: totalDy * (eased - previousEase)
      });
      // graphRoam may recreate text elements with their default visibility.
      // Reapply the zoom/focus label policy before the browser paints this frame.
      updateGlobalLabels(chart, state.zoom, state.showChildren);
      previousScale = scale;
      previousEase = eased;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        state.animatingAnchor = false;
        updateGlobalLabels(chart, state.zoom, state.showChildren);
      }
    }
    requestAnimationFrame(frame);
  }

  function smoothReturnHome(chart) {
    if (chart.__cancelRoamInertia) chart.__cancelRoamInertia();
    var state = chart.__graphState;
    var home = graphData.nodes.find(function (node) {
      return normalizePath(node.value) === '/';
    });
    var homeCenter = home && nodeCenter(chart, home.id);
    if (!state || !home || !homeCenter) return;

    var targetZoom = state.overviewZoom || 0.62;
    var totalScale = targetZoom / state.zoom;
    var anchorX = homeCenter[0];
    var anchorY = homeCenter[1];
    var totalDx = chart.getWidth() / 2 - anchorX;
    var totalDy = chart.getHeight() / 2 - anchorY;
    var startedAt = performance.now();
    var previousEase = 0;
    var previousScale = 1;
    state.animatingAnchor = true;
    chart.__anchorAnimation = (chart.__anchorAnimation || 0) + 1;
    var animationId = chart.__anchorAnimation;

    function frame(now) {
      if (animationId !== chart.__anchorAnimation || chart.isDisposed()) return;
      var progress = Math.min(1, (now - startedAt) / 760);
      var eased = 1 - Math.pow(1 - progress, 3);
      var scale = 1 + (totalScale - 1) * eased;
      chart.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        zoom: scale / previousScale,
        originX: anchorX + totalDx * previousEase,
        originY: anchorY + totalDy * previousEase
      });
      chart.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        dx: totalDx * (eased - previousEase),
        dy: totalDy * (eased - previousEase)
      });
      updateGlobalLabels(chart, state.zoom, state.showChildren);
      previousScale = scale;
      previousEase = eased;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        state.animatingAnchor = false;
        updateGlobalLabels(chart, state.zoom, state.showChildren);
      }
    }
    requestAnimationFrame(frame);
  }

  function branchStatistics() {
    var current = currentNode();
    if (!current) return { scope: 'Current branch', notes: 0, levels: 0 };
    var children = new Map();
    hierarchyLinks().forEach(function (link) {
      if (!children.has(link.source)) children.set(link.source, []);
      children.get(link.source).push(link.target);
    });
    var depths = new Map([[current.id, 0]]);
    var queue = [current.id];
    var maxDepth = 0;
    while (queue.length) {
      var id = queue.shift();
      (children.get(id) || []).forEach(function (child) {
        if (depths.has(child)) return;
        var depth = depths.get(id) + 1;
        depths.set(child, depth);
        maxDepth = Math.max(maxDepth, depth);
        queue.push(child);
      });
    }
    var words = graphData.nodes.reduce(function (total, node) {
      return total + (depths.has(node.id) ? Number(node.wordCount || 0) : 0);
    }, 0);
    var paths = graphData.links.filter(function (link) {
      return depths.has(link.source) && depths.has(link.target);
    }).length;
    return {
      scope: current.name,
      notes: depths.size,
      words: words,
      levels: maxDepth + 1,
      branches: (children.get(current.id) || []).length,
      paths: paths
    };
  }

  function graphStatistics(focused) {
    var currentBranch = branchStatistics();
    if (focused) {
      return {
        scope: currentBranch.scope,
        metrics: [
          { label: 'Notes', value: currentBranch.notes },
          { label: 'Words', value: currentBranch.words, compact: true },
          { label: 'Levels', value: currentBranch.levels }
        ]
      };
    }
    return {
      scope: '',
      metrics: [
        { label: 'Notes', value: graphData.nodes.length },
        {
          label: 'Words',
          value: currentBranch.words,
          compact: true
        },
        { label: 'Branches', value: currentBranch.branches },
        { label: 'Paths', value: currentBranch.paths }
      ]
    };
  }

  function formatStatistic(value, compact) {
    var rounded = Math.max(0, Math.round(value));
    if (!compact || rounded < 1000) return rounded.toLocaleString();
    if (rounded >= 1000000) {
      return (rounded / 1000000).toFixed(rounded >= 10000000 ? 0 : 1)
        .replace(/\.0$/, '') + 'm';
    }
    return (rounded / 1000).toFixed(rounded >= 100000 ? 0 : 1)
      .replace(/\.0$/, '') + 'k';
  }

  function updateGraphStatistics(modal, focused) {
    var container = modal.querySelector('.graph-modal-stats');
    if (!container) return;
    var statistics = graphStatistics(focused);
    var previous = container.__values || [];
    container.classList.toggle('is-focused', focused);
    container.__animation = (container.__animation || 0) + 1;
    var animation = container.__animation;
    container.classList.add('is-changing');

    window.setTimeout(function () {
      if (animation !== container.__animation) return;
      container.replaceChildren();
      if (statistics.scope) {
        var scope = document.createElement('span');
        scope.className = 'graph-stat-scope';
        scope.textContent = statistics.scope;
        container.appendChild(scope);
      }
      var numberElements = statistics.metrics.map(function (metric, index) {
        var item = document.createElement('span');
        item.className = 'graph-stat';
        item.dataset.metric = metric.label.toLowerCase();
        var number = document.createElement('strong');
        number.textContent = String(previous[index] || 0);
        var label = document.createElement('span');
        label.textContent = metric.label;
        item.append(number, label);
        container.appendChild(item);
        return number;
      });
      container.classList.remove('is-changing');
      container.classList.add('is-entering');
      var startedAt = performance.now();
      function count(now) {
        if (animation !== container.__animation) return;
        var progress = Math.min(1, (now - startedAt) / 560);
        var eased = 1 - Math.pow(1 - progress, 3);
        statistics.metrics.forEach(function (metric, index) {
          var from = previous[index] || 0;
          numberElements[index].textContent = formatStatistic(
            from + (metric.value - from) * eased,
            metric.compact
          );
        });
        if (progress < 1) {
          requestAnimationFrame(count);
        } else {
          container.classList.remove('is-entering');
          container.__values = statistics.metrics.map(function (metric) { return metric.value; });
        }
      }
      requestAnimationFrame(count);
    }, previous.length ? 110 : 0);
  }

  function resetGardenControls(modal, chart) {
    var anchorButton = modal.querySelector('[data-action="anchor"]');
    var childrenButton = modal.querySelector('[data-action="children"]');
    chart.__anchorAnimation = (chart.__anchorAnimation || 0) + 1;
    chart.__graphState.animatingAnchor = false;
    chart.__graphState.showChildren = false;
    if (chart.__graphState.focusBranch) clearCurrentBranchFocus(chart);
    [anchorButton, childrenButton].forEach(function (button) {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
  }

  function refreshGardenRelations(chart) {
    // A node can be clicked while its hover focus is still active. Clear that
    // temporary opacity snapshot before calculating the new current-node fog;
    // otherwise the later mouseout restores depth values from the old branch.
    restoreRelationshipHover(chart);
    var series = chart.getModel().getSeriesByIndex(0);
    var data = series && series.getData();
    if (!data) return;
    var context = relationContext();
    var descendants = currentDescendants();
    var distances = graphDistances();
    var colors = palette();
    var current = currentNode();

    for (var index = 0; index < data.count(); index += 1) {
      var node = data.getRawDataItem(index);
      var element = symbolElement(data.getItemGraphicEl(index));
      if (!node || !element) continue;
      var kind = relation(node, context);
      var depth = distances.has(node.id) ? distances.get(node.id) : 99;
      node.relation = kind;
      node.graphDepth = depth;
      node.isDescendant = descendants.has(node.id);
      var nodeStyle = {
        fill: colors[kind],
        stroke: colors.border,
        opacity: fogNodeOpacity(depth, kind)
      };
      node.itemStyle = Object.assign({}, node.itemStyle, {
        color: colors[kind],
        borderColor: colors.border,
        opacity: nodeStyle.opacity
      });
      if (typeof data.setItemVisual === 'function') {
        data.setItemVisual(index, 'style', Object.assign(
          {}, data.getItemVisual(index, 'style') || {}, nodeStyle
        ));
      }
      element.setStyle(nodeStyle);
      element.__gardenOriginalStyle = null;
    }

    var edges = series.getEdgeData && series.getEdgeData();
    if (edges) {
      for (var edgeIndex = 0; edgeIndex < edges.count(); edgeIndex += 1) {
        var link = edges.getRawDataItem(edgeIndex);
        var edge = edgeElement(edges.getItemGraphicEl(edgeIndex));
        if (!link || !edge) continue;
        var sourceDepth = distances.has(link.source) ? distances.get(link.source) : 99;
        var targetDepth = distances.has(link.target) ? distances.get(link.target) : 99;
        var isTrunk = link.kind === 'hierarchy' && current && (
          link.source === current.id || link.target === current.id ||
          (descendants.has(link.source) && descendants.has(link.target))
        );
        edge.setStyle({
          stroke: isTrunk ? colors.trunk : colors.line,
          lineWidth: isTrunk ? 1.8 : 1.1,
          opacity: isTrunk ? 0.68 : fogEdgeOpacity(Math.min(sourceDepth, targetDepth), false)
        });
        edge.__gardenOriginalStyle = null;
      }
    }
    chart.__graphState.focusBranch = false;
    chart.__graphState.focusVisualApplied = false;
    updateCurrentRipple(chart);
    updateGlobalLabels(chart, chart.__graphState.zoom, false);
    chart.getZr().refresh();
  }

  function smoothSelectGardenNode(chart, nodeId) {
    if (chart.__cancelRoamInertia) chart.__cancelRoamInertia();
    var state = chart.__graphState;
    var point = nodeCenter(chart, nodeId);
    if (!state || !point) return;
    var totalDx = chart.getWidth() / 2 - point[0];
    var totalDy = chart.getHeight() / 2 - point[1];
    var startedAt = performance.now();
    var previousEase = 0;
    state.animatingAnchor = true;
    chart.__anchorAnimation = (chart.__anchorAnimation || 0) + 1;
    var animationId = chart.__anchorAnimation;

    function frame(now) {
      if (animationId !== chart.__anchorAnimation || chart.isDisposed()) return;
      var progress = Math.min(1, (now - startedAt) / 620);
      var eased = 1 - Math.pow(1 - progress, 3);
      chart.dispatchAction({
        type: 'graphRoam',
        seriesIndex: 0,
        dx: totalDx * (eased - previousEase),
        dy: totalDy * (eased - previousEase)
      });
      previousEase = eased;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        state.animatingAnchor = false;
        updateGlobalLabels(chart, state.zoom, false);
      }
    }
    requestAnimationFrame(frame);
  }

  function loadGardenPageBehind(target, previousUrl) {
    var token = ++gardenNavigationToken;
    var modal = document.getElementById('modal_background');
    if (modal) modal.classList.add('is-navigating');
    window.fetch(target.href, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Digital-Garden-Navigation': '1' }
    }).then(function (response) {
      if (!response.ok) throw new Error('Unable to load ' + target.href);
      return response.text();
    }).then(function (html) {
      if (token !== gardenNavigationToken) return;
      var nextDocument = new DOMParser().parseFromString(html, 'text/html');
      var nextMain = nextDocument.querySelector('.md-main');
      var currentMain = document.querySelector('.md-main');
      if (!nextMain || !currentMain) throw new Error('Page content is missing');
      currentMain.replaceWith(nextMain);
      var nextTabs = nextDocument.querySelector('.md-tabs');
      var currentTabs = document.querySelector('.md-tabs');
      if (nextTabs && currentTabs) currentTabs.innerHTML = nextTabs.innerHTML;
      document.title = nextDocument.title || document.title;
      if (modal) modal.classList.remove('is-navigating');
    }).catch(function (error) {
      if (token !== gardenNavigationToken) return;
      window.history.replaceState({}, '', previousUrl);
      if (modal) modal.classList.remove('is-navigating');
      console.error(error);
    });
  }

  function selectGardenNode(chart, node) {
    var modal = document.getElementById('modal_background');
    if (!modal) return;
    var target = new URL(node.value, window.location.href);
    var previousUrl = window.location.href;
    if (normalizePath(window.location.pathname) !== normalizePath(target.pathname)) {
      window.history.pushState({ digitalGarden: true }, '', target.href);
    }
    resetGardenControls(modal, chart);
    refreshGardenRelations(chart);
    updateGraphStatistics(modal, false);
    smoothSelectGardenNode(chart, node.id);
    loadGardenPageBehind(target, previousUrl);
  }

  function finishCloseGlobal() {
    if (globalChart) {
      window.clearTimeout(globalChart.__layoutSaveTimer);
      if (globalChart.__globalLayoutStable) saveGlobalLayout(globalChart);
      globalChart.dispose();
    }
    globalChart = null;
    globalContainer = null;
    var modal = document.getElementById('modal_background');
    if (modal) modal.remove();
    document.body.style.overflow = '';
    document.body.style.position = '';
    var graph = addGraphDiv();
    if (graph) localChart = initChart(graph, true);
  }

  function closeGlobal() {
    var modal = document.getElementById('modal_background');
    if (!modal || modal.classList.contains('is-closing')) return;
    modal.classList.add('is-closing');
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(finishCloseGlobal, reducedMotion ? 0 : 220);
  }

  function openGlobal() {
    gardenNavigationToken += 1;
    if (localChart) localChart.dispose();
    var local = document.getElementById('graph');
    if (local) local.remove();
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';

    var modal = document.createElement('div');
    modal.id = 'modal_background';
    modal.innerHTML = '<section class="graph-modal-shell" role="dialog" aria-modal="true" aria-label="Digital Garden"><header class="graph-modal-header"><div class="graph-modal-identity"><div class="graph-modal-brand">' + graphLogo() + '<span>Digital Garden</span></div><div class="graph-modal-stats" aria-live="polite"></div></div><nav class="graph-modal-tools" aria-label="Graph controls"><button type="button" data-action="anchor" data-tooltip="Focus current branch" title="Focus current branch" aria-label="Focus current branch" aria-pressed="false"><span class="graph-control-anchor">⌖</span></button><button type="button" data-action="zoom-out" data-tooltip="Zoom out" title="Zoom out" aria-label="Zoom out">−</button><button type="button" data-action="zoom-in" data-tooltip="Zoom in" title="Zoom in" aria-label="Zoom in">+</button><button type="button" data-action="children" data-tooltip="Show all descendant titles" title="Show all descendant titles" aria-label="Show all descendant titles" aria-pressed="false"><span class="graph-control-text">Aa</span></button><button type="button" data-action="close" data-tooltip="Close" title="Close Digital Garden" aria-label="Close Digital Garden">×</button></nav></header><div id="graph" class="modal_graph graph"></div></section>';
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add('is-open'); });
    updateGraphStatistics(modal, false);
    globalContainer = modal.querySelector('#graph');
    globalChart = initChart(globalContainer, false);
    modal.querySelector('[data-action="anchor"]').addEventListener('click', function (event) {
      var childrenButton = modal.querySelector('[data-action="children"]');
      if (globalChart.__graphState.focusBranch) {
        globalChart.__anchorAnimation = (globalChart.__anchorAnimation || 0) + 1;
        globalChart.__graphState.animatingAnchor = false;
        globalChart.__graphState.showChildren = false;
        childrenButton.classList.remove('is-active');
        childrenButton.setAttribute('aria-pressed', 'false');
        clearCurrentBranchFocus(globalChart);
        event.currentTarget.classList.remove('is-active');
        event.currentTarget.setAttribute('aria-pressed', 'false');
        updateGraphStatistics(modal, false);
        smoothReturnHome(globalChart);
        return;
      }
      globalChart.__graphState.showChildren = true;
      childrenButton.classList.add('is-active');
      childrenButton.setAttribute('aria-pressed', 'true');
      event.currentTarget.classList.add('is-active');
      event.currentTarget.setAttribute('aria-pressed', 'true');
      updateGraphStatistics(modal, true);
      smoothAnchorCurrent(globalChart);
    });
    modal.querySelector('[data-action="zoom-out"]').addEventListener('click', function () {
      zoomChart(globalChart, 1 / 1.22);
    });
    modal.querySelector('[data-action="zoom-in"]').addEventListener('click', function () {
      zoomChart(globalChart, 1.22);
    });
    modal.querySelector('[data-action="children"]').addEventListener('click', function (event) {
      var state = globalChart.__graphState;
      state.showChildren = !state.showChildren;
      event.currentTarget.classList.toggle('is-active', state.showChildren);
      event.currentTarget.setAttribute('aria-pressed', String(state.showChildren));
      updateGlobalLabels(globalChart, state.zoom, state.showChildren);
    });
    modal.querySelector('[data-action="close"]').addEventListener('click', closeGlobal);
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeGlobal();
    });
  }

  function addButton() {
    if (document.getElementById('graph_button')) return;
    var form = document.createElement('form');
    form.className = 'md-header__option';
    form.innerHTML = '<button id="graph_button" type="button" class="md-header__button md-icon" aria-label="Open Digital Garden">' + graphLogo() + '</button>';
    var search = document.querySelector('.md-search');
    if (search && search.parentNode) search.parentNode.insertBefore(form, search);
    form.querySelector('button').addEventListener('click', openGlobal);
  }

  function redrawForTheme() {
    window.setTimeout(function () {
      if (localChart) {
        localChart.__graphLabelsSilenced = false;
        localChart.setOption(chartOption(true), true);
      }
      if (globalChart) {
        globalChart.__graphLabelsSilenced = false;
        globalChart.__graphState.focusVisualApplied = false;
        globalChart.setOption(chartOption(false), true);
      }
    }, 0);
  }

  function loadGraph() {
    var script = document.currentScript;
    $.ajax({
      url: new URL('./graph.json', script.src).href,
      dataType: 'json',
      cache: false
    }).done(function (graph) {
      graphData = graph;
      loadGlobalLayout();
      addButton();
      var container = addGraphDiv();
      if (container) localChart = initChart(container, true);
      $('#__palette_0, #__palette_1').on('change', redrawForTheme);
      window.addEventListener('resize', function () {
        if (localChart) localChart.resize();
        if (globalChart) globalChart.resize();
      });
      window.addEventListener('pagehide', function () {
        if (globalChart && globalChart.__globalLayoutStable) saveGlobalLayout(globalChart);
      });
    });
  }

  loadGraph();
}());
