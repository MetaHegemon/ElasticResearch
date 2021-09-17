const clog = console.log.bind(console),
    wlog = console.warn.bind(console),
    elog = console.error.bind(console);

const Reader = (function () {
    function Reader() {
        this.data = {};
    }

    Reader.prototype.run = function (object) {
        this.data = {
            name: object.Name,
            tree: {}
        };
        this.data.tree = this.read(object);

        return this.data;
    };

    Reader.prototype.read = function (object) {
        const result = [];
        for (let i = 0; i < object.Count; i += 1) {
            const objData = {}
            const obj = object[i];

            if (obj instanceof TModelLimits) {
                objData.type = 'TModelLimits';
                objData.size = {
                    width: obj.Width,
                    height: obj.Height,
                    depth: obj.Depth
                };
                objData.position = this.getPos(obj);
            } else if (obj instanceof TFurnPanel) {
                objData.type = 'TFurnPanel';
                objData.name = obj.Name;
                objData.size = {
                    width: obj.ContourWidth,
                    height: obj.ContourHeight,
                    depth: obj.Thickness
                };
                objData.position = this.getPos(obj);
            } else if (obj instanceof TFurnBlock) {
                objData.type = 'TFurnBlock';
                objData.name = obj.Name;
                objData.size = {
                    width: obj.Width,
                    height: obj.Height,
                    depth: obj.Depth
                };
                objData.position = this.getPos(obj);
                objData.children = this.read(obj);

                objData.elastic = {
                    isElastic: obj.IsElastic(),
                    constraints: {},
                    planes: []
                };

                //read elastic planes
                if (objData.elastic.isElastic) {

                    const elasticNode = obj.ParamSectionNode('Elastic');

                    objData.elastic.constraints = {
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

                    objData.elastic.planes = this.readElasticPlanes(elasticNode);
                }
            }
            result.push(objData);
        }
        return result;
    }

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
    }

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
