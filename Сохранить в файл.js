const FS = require('fs'),
    PATH = require('path');

const clog = console.log.bind(console),
    wlog = console.warn.bind(console),
    elog = console.error.bind(console);

/*
Bazis information:
TextureOrientation: 2-vertical, 1 - horizontal, 0 - no matter
indexes:
        1
   |---------|
 3 | F4  B5  | 2
   |---------|
        0
*/

const Reader = (function () {
    function Reader() {
        this.data = {};
        this.allHoles = [];
    }

    Reader.prototype.gatherAllFasteners = function (node, result) {
        for (let i = 0; i < node.Count; i++) {
            if (!(node[i] instanceof TFastener)) {
                if (node[i].List) {
                    result = this.gatherAllFasteners(node[i], result);
                }
                continue;
            }

            result.push({
                name: node[i].Name,
                artPos: node[i].ArtPos,
                position: node[i].Owner.ToGlobal(node[i].Position),
                rotation: {
                    x: node[i].Rotation.ImagPart.x,
                    y: node[i].Rotation.ImagPart.y,
                    z: node[i].Rotation.ImagPart.z,
                    w: node[i].Rotation.RealPart,
                }
            });
        }

        return result;
    };


    Reader.prototype.gatherAllHoles = function (node, result) {
        /* inside hole:
                Tag
                Optional
                DrillMode
                Depth
                Contour
                Diameter
                Radius
                Direction
                Position
                TransformMatrix
                Transform
                SaveTo
                LoadFrom
                SaveToXml
                LoadFromXml
                SaveToXBS
                LoadFromXBS
                Assign
                CompareHole
                EndPosition
                RayIntersect
        */

        for (let i = 0; i < node.Count; i++) {
            let isFurniture = false;

            for (let key in node[i]) {
                if (key === 'Holes') {
                    isFurniture = true;
                    break;
                }
            }
            if (!isFurniture) {
                if (node[i].List) {
                    result = this.gatherAllHoles(node[i], result);
                }
                continue;
            }
            for (let j = 0; j < node[i].Holes.Count; j += 1) {
                const hole = node[i].Holes[j];
                result.push(
                    {
                        position: node[i].ToGlobal(hole.Position),
                        endPosition: node[i].ToGlobal(hole.EndPosition()),
                        direction: node[i].NToGlobal(hole.Direction),
                        diameter: hole.Diameter,
                        depth: hole.Depth
                    }
                );
            }
        }

        return result;
    };

    Reader.prototype.run = function (object) {
        this.allFasteners = this.gatherAllFasteners(object, []);
        this.allHoles = this.gatherAllHoles(object, []);

        this.data = {
            name: object.Name,
            elastic: this.getElasticParams(object),
            size: this.getModuleSize(object),
            holes: this.allHoles,
            fasteners: this.allFasteners,
            tree: this.read(object)
        };

        return this.data;
    };

    /**
     * Находит размеры модуля.
     * @returns {object}
     */
    Reader.prototype.getModuleSize = function (object) {
        const size = { width: object.GSize.x, height: object.GSize.y, depth: object.GSize.z };
        return size;
    };

    Reader.prototype.getElasticParams = function (object) {
        const elasticData = {
            isElastic: object.IsElastic(),
            constraints: {},
            planes: []
        };
        //read elastic planes
        if (elasticData.isElastic) {

            const elasticNode = object.ParamSectionNode('Elastic');

            elasticData.constraints = {
                min: {
                    x: elasticNode.FindOrCreate('AreaMin').FindOrCreate('x').Value || 0,
                    y: elasticNode.FindOrCreate('AreaMin').FindOrCreate('y').Value || 0,
                    z: elasticNode.FindOrCreate('AreaMin').FindOrCreate('z').Value || 0
                },
                max: {
                    x: elasticNode.FindOrCreate('AreaMax').FindOrCreate('x').Value || 0,
                    y: elasticNode.FindOrCreate('AreaMax').FindOrCreate('y').Value || 0,
                    z: elasticNode.FindOrCreate('AreaMax').FindOrCreate('z').Value || 0
                },
                step: {
                    x: elasticNode.FindOrCreate('AreaStep').FindOrCreate('x').Value || 0,
                    y: elasticNode.FindOrCreate('AreaStep').FindOrCreate('y').Value || 0,
                    z: elasticNode.FindOrCreate('AreaStep').FindOrCreate('z').Value || 0
                }
            }

            elasticData.planes = this.readElasticPlanes(elasticNode);
        }

        return elasticData;
    };

    Reader.prototype.readElasticPlanes = function (elasticNode) {
        const planes = [];
        const planesNode = elasticNode.FindOrCreate('Planes');

        if (planesNode) {
            for (let i = 0; i < planesNode.Count; i++) {
                const planeNode = planesNode[i];
                const axisNode = planeNode.FindNode('Axis');
                const posNode = planeNode.FindNode('Pos');
                const weightNode = planeNode.FindNode('Weight');

                const axis = axisNode ? axisNode.Value : 0;
                const pos = posNode ? posNode.Value : 0;
                const weight = weightNode ? weightNode.Value : 0;

                /**
               * Axis: Ось, перпендекулярная плоскости эластичности.
               * 0 = X;
               * 1 = Y;
               * 2 = Z;
               */
                planes.push({
                    axis: axis,
                    pos: pos,
                    weight: weight
                });
            }
        }

        return planes;
    };

    Reader.prototype.read = function (object) {
        const result = [];
        for (let i = 0; i < object.Count; i += 1) {
            let objData;
            const obj = object[i];

            if (obj instanceof TModelLimits) {
                objData = {};
                objData.type = 'TModelLimits';
                objData.size = {
                    width: obj.Width,
                    height: obj.Height,
                    depth: obj.Depth
                };
                objData.position = this.getPos(obj);
                objData.rotation = this.getRotation(obj.Rotation);
            }
            else if (obj instanceof TFurnPanel) {
                objData = {};
                objData.type = 'TFurnPanel';
                objData.name = obj.Name;
                objData.size = {
                    width: obj.ContourWidth,
                    height: obj.ContourHeight,
                    depth: obj.Thickness
                };
                objData.textureOrientation = obj.TextureOrientation === 1 ? 'horizontal' : obj.TextureOrientation === 2 ? 'vertical' : 'nomatter';
                objData.position = this.getPos(obj);
                objData.rotation = this.getRotation(obj.Rotation);

                const buttTop = this.getButt('top', obj);
                if (buttTop) objData.buttTop = buttTop;
                const buttLeft = this.getButt('left', obj);
                if (buttLeft) objData.buttLeft = this.getButt('left', obj);
                const buttBottom = this.getButt('bottom', obj);
                if (buttBottom) objData.buttBottom = this.getButt('bottom', obj);
                const buttRight = this.getButt('right', obj);
                if (buttRight) objData.buttRight = this.getButt('right', obj);
            }
            else if (obj instanceof TFurnBlock) {
                objData = {};

                objData.type = 'TFurnBlock';
                objData.name = obj.Name;
                objData.size = {
                    width: obj.GSize.x,
                    height: obj.GSize.y,
                    depth: obj.GSize.z
                };
                objData.position = this.getPos(obj);

                objData.rotation = this.getRotation(obj.Rotation)

                objData.children = this.read(obj);
            }
            if (objData) result.push(objData);
        }
        return result;
    };

    Reader.prototype.getHolesFromPanel = function (holes, panel) {
        const MM = this.getMinMax(panel);
        const bores = [];

        function Bore(plane, d, x, y, z, dp, drillSide) {
            this.plane = plane;
            this.d = d;
            this.x = x;
            this.y = y;
            this.z = z;
            this.dp = dp;
            this.drillSide = drillSide;
        }

        for (let i = 0; i < holes.length; i += 1) {
            const hole = holes[i];

            const holeDir = panel.NToObject(hole.direction);

            const holePos = panel.GlobalToObject(hole.position);
            //holePos.x -= panel.Contour.Min.x;
            //holePos.y -= panel.Contour.Min.y;

            const holeEndPos = panel.GlobalToObject(hole.endPosition);
            //holeEndPos.x -= panel.Contour.Min.x;
            //holeEndPos.y -= panel.Contour.Min.y;

            if (holePos.z < -(hole.obj.Depth + panel.Thickness) || holePos.z > (hole.obj.Depth + panel.Thickness)) {
                //если отверстие не касается панели
                continue;
            }
            //Find bores to face or back
            if (Math.round(Math.abs(holeDir.z)) === 1 && this.isPointInsidePanel(hole.position, panel)) {
                if (holeDir.z > 0.001) {
                    const depth = this.rnd2(holePos.z + hole.obj.Depth);
                    if (holePos.z <= 0.001 && depth > 0) {
                        const drillSide = (Math.round(panel.Thickness * 10) > Math.round(depth * 10)) ? 'back' : 'throught';
                        bores.push(new Bore(5, hole.obj.Diameter, holePos.x - MM.minX, holePos.y - MM.minY, 0, depth, drillSide));
                        hole.used = this.isEqualFloat(holePos.z, 0) && (panel.Thickness >= hole.obj.Depth);
                    }
                    continue;
                } else {
                    const depth = hole.obj.Depth - (holePos.z - panel.Thickness);
                    if ((holePos.z - panel.Thickness) >= -0.001 && depth >= 0.001) {
                        const drillSide = (Math.round(panel.Thickness * 10) > Math.round(depth * 10)) ? 'front' : 'throught';
                        bores.push(new Bore(4, hole.obj.Diameter, holePos.x - MM.minX, holePos.y - MM.minY, 0, depth, drillSide));
                        hole.used = this.isEqualFloat(holePos.z, panel.Thickness) && (panel.Thickness >= hole.obj.Depth);
                    }
                    continue;
                }
            }

            //ignore holes width direction to face or back or .. or ..
            if (this.rnd2(holeDir.z) !== 0 || holePos.z <= 0 || holePos.z >= panel.Thickness) continue;


            if (this.isPointInsidePanel(hole.endPosition, panel)) {

                const hdx = this.rnd2(holeDir.x);
                const hdy = this.rnd2(holeDir.y);

                for (let j = 0; j < panel.Contour.Count; j++) {
                    const contour = panel.Contour[j];
                    const contourButt = contour.Data && contour.Data.Butt ? contour.Data.Butt : null;
                    const buttThickness = (contourButt && !contourButt.ClipPanel) ? contourButt.Thickness : 0;
                    if (
                        this.rnd2(contour.DistanceToPoint(holePos) + contour.DistanceToPoint(holeEndPos)) === this.rnd2(hole.obj.Depth) &&
                        this.rnd2(contour.DistanceToPoint(holeEndPos) + buttThickness) > 2
                    ) {

                        const depth = this.rnd2(contour.DistanceToPoint(holeEndPos) + buttThickness);
                        if (hdx === 1) {
                            bores.push(new Bore(2, hole.obj.Diameter, 0, holePos.y - MM.minY, panel.Thickness - holePos.z, depth, 'left'));
                            hole.used = this.isEqualFloat(depth, hole.obj.Depth);
                            break;
                        } else if (hdx === -1) {
                            const width = panel.TextureOrientation === 1 ? panel.ContourWidth : panel.ContourWidth;
                            bores.push(new Bore(3, hole.obj.Diameter, width, holePos.y - MM.minY, panel.Thickness - holePos.z, depth, 'right'));
                            hole.used = this.isEqualFloat(depth, hole.obj.Depth);
                            break;
                        } else if (hdx === 0) {
                            if (hdy === 1) {
                                bores.push(new Bore(1, hole.obj.Diameter, holePos.x - MM.minX, 0, panel.Thickness - holePos.z, depth, 'bottom'));
                            } else if (hdy === -1) {
                                const height = panel.TextureOrientation === 1 ? panel.ContourHeight : panel.ContourHeight;
                                bores.push(new Bore(0, hole.obj.Diameter, holePos.x - MM.minX, height, panel.Thickness - holePos.z, depth, 'top'));
                            }
                            hole.used = this.isEqualFloat(depth, hole.obj.Depth);
                            break;
                        }
                    }
                }
            }
        }

        return bores;
    };

    Reader.prototype.getMinMax = function (node) {
        let minX = 1000000;
        let minY = 1000000;
        let maxX = -1000000;
        let maxY = -1000000;
        if (node.Contour.Count > 0) {
            for (let i = 0; i < node.Contour.Count; i += 1) {
                const contour = node.Contour[i];
                if (contour.ElType === 1) {
                    minX = Math.min(minX, contour.Pos1.x);
                    minY = Math.min(minY, contour.Pos1.y);
                    maxX = Math.max(maxX, contour.Pos1.x);
                    maxY = Math.max(maxY, contour.Pos1.y);
                    minX = Math.min(minX, contour.Pos2.x);
                    minY = Math.min(minY, contour.Pos2.y);
                    maxX = Math.max(maxX, contour.Pos2.x);
                    maxY = Math.max(maxY, contour.Pos2.y);
                } else if (contour.ElType === 2) {

                    if (contour.AngleOnArc(Math.PI)) {
                        minX = Math.min(minX, contour.Center.x - contour.ArcRadius());
                    } else {
                        minX = Math.min(minX, contour.Pos1.x);
                        minX = Math.min(minX, contour.Pos2.x);
                    }

                    if (contour.AngleOnArc(0) || contour.AngleOnArc(Math.PI * 2.0)) {
                        maxX = Math.max(maxX, contour.Center.x + contour.ArcRadius());
                    } else {
                        maxX = Math.max(maxX, contour.Pos1.x);
                        maxX = Math.max(maxX, contour.Pos2.x);
                    }
                    if (contour.AngleOnArc((Math.PI * 3.0) / 2.0)) {
                        minY = Math.min(minY, contour.Center.y - contour.ArcRadius());
                    } else {
                        minY = Math.min(minY, contour.Pos1.y);
                        minY = Math.min(minY, contour.Pos2.y);
                    }
                    if (contour.AngleOnArc(Math.PI / 2.0)) {
                        maxY = Math.max(maxY, contour.Center.y + contour.ArcRadius());
                    } else {
                        maxY = Math.max(maxY, contour.Pos1.y);
                        maxY = Math.max(maxY, contour.Pos2.y);
                    }
                } else if (elem.ElType === 3) {
                    minX = Math.min(minX, contour.Center.x - contour.CirRadius);
                    minY = Math.min(minY, contour.Center.y - contour.CirRadius);
                    maxX = Math.max(maxX, contour.Center.x + contour.CirRadius);
                    maxY = Math.max(maxY, contour.Center.y + contour.CirRadius);
                }
            }
        } else {
            minX = node.GMin.x;
            minY = node.GMin.y;
            maxX = node.GMax.x;
            maxY = node.GMax.y;
        }


        return {
            minX: minX,
            minY: minY,
            maxX: maxX,
            maxY: maxY
        };
    };

    Reader.prototype.isEqualFloat = function (v1, v2) {
        return Math.abs(v1 - v2) < 0.001;
    };

    Reader.prototype.rnd2 = function (val) {
        let result = parseFloat(val.toFixed(2));
        if (result == -0) {
            result = 0;
        }
        return result;
    };

    Reader.prototype.isPointInsidePanel = function (point, panel) {
        const cMin = panel.ToGlobal({ x: panel.Contour.Min.x, y: panel.Contour.Min.y });
        const cMax = panel.ToGlobal({ x: panel.Contour.Max.x, y: panel.Contour.Max.y });
        cMin.x = Math.round(cMin.x);
        cMin.y = Math.round(cMin.y);
        cMin.z = Math.round(cMin.z);
        cMax.x = Math.round(cMax.x);
        cMax.y = Math.round(cMax.y);
        cMax.z = Math.round(cMax.z);

        const x = Math.round(point.x);
        const y = Math.round(point.y);
        const z = Math.round(point.z);

        let res = false;
        if (cMin.x === cMax.x) {
            if (
                ((y >= cMin.y && y <= cMax.y) || (y <= cMin.y && y >= cMax.y)) &&
                ((z >= cMin.z && z <= cMax.z) || (z <= cMin.z && z >= cMax.z))
            ) {
                res = true;
            }
        } else if (cMin.y === cMax.y) {
            if (
                ((x >= cMin.x && x <= cMax.x) || (x <= cMin.x && x >= cMax.x)) &&
                ((z >= cMin.z && z <= cMax.z) || (z <= cMin.z && z >= cMax.z))
            ) {
                res = true;
            }
        } else if (cMin.z === cMax.z) {
            if (
                ((x >= cMin.x && x <= cMax.x) || (x <= cMin.x && x >= cMax.x)) &&
                ((y >= cMin.y && y <= cMax.y) || (y <= cMin.y && y >= cMax.y))
            ) {
                res = true;
            }
        } else {
            if (
                ((x >= cMin.x && x <= cMax.x) || (x <= cMin.x && x >= cMax.x)) &&
                ((y >= cMin.y && y <= cMax.y) || (y <= cMin.y && y >= cMax.y)) &&
                ((z >= cMin.z && z <= cMax.z) || (z <= cMin.z && z >= cMax.z))
            ) {
                res = true;
            }
        }

        return res;
    };

    Reader.prototype.getSizes = function (obj) {
        return {
            width: obj.ContourWidth,
            height: obj.ContourHeight,
            depth: obj.Thickness
        };
    };

    Reader.prototype.getPos = function (obj) {
        return {
            x: obj.PositionX,
            y: obj.PositionY,
            z: obj.PositionZ
        };
    };

    Reader.prototype.getRotation = function (rotation) {
        return {
            x: rotation.ImagPart.x,
            y: rotation.ImagPart.y,
            z: rotation.ImagPart.z,
            w: rotation.RealPart
        };
    };

    Reader.prototype.getButt = function (side, panel) {
        let butt = null;
        const buttData = {
            name: null,
            thickness: null,
            width: null,
            clipPanel: null
        };

        /* if (panel.TextureOrientation === 1) {
             if (type === 'bottom') {
                 butt = this.getButtByElemIndex(panel.Butts, 1);
             } else if (type === 'top') {
                 butt = this.getButtByElemIndex(panel.Butts, 3);
             } else if (type === 'left') {
                 butt = this.getButtByElemIndex(panel.Butts, 0);
             } else if (type === 'right') {
                 butt = this.getButtByElemIndex(panel.Butts, 2);
             }
         } else {*/
        if (side === 'bottom') {
            butt = this.getButtByElemIndex(panel.Butts, 0);
        } else if (side === 'top') {
            butt = this.getButtByElemIndex(panel.Butts, 2);
        } else if (side === 'left') {
            butt = this.getButtByElemIndex(panel.Butts, 3);
        } else if (side === 'right') {
            butt = this.getButtByElemIndex(panel.Butts, 1);
        }
        //}
        if (!butt) return null;
        buttData.name = butt.Sign;
        buttData.thickness = butt.Thickness;
        buttData.width = butt.Width;
        buttData.clipPanel = butt.ClipPanel;

        return buttData;
    };

    Reader.prototype.getButtByElemIndex = function (butts, elemIndex) {
        let butt = 0;
        for (let i = 0; i < butts.Count; i += 1) {
            if (butts[i].ElemIndex === elemIndex) {
                butt = butts[i];
                break;
            }
        }
        return butt;
    };

    return new Reader();
})();

const Saver = (function () {
    function Saver() {

    }

    Saver.prototype.save = function (data) {
        //set all values to string
        let json = JSON.stringify(data);
        json = JSON.parse(json, (key, val) => {
            let res = val;
            if (typeof val !== 'object') {

                res = String(val)

            } else if (val === null) {
                res = 'null';
            }
            return res;
        });
        json = JSON.stringify(json);

        //save
        const path = system.askFileNameSave('json');
        if (path) {
            FS.writeFileSync(path, json);
        }

    };

    return new Saver();
})();

const data = Reader.run(Model);

Saver.save(data);
