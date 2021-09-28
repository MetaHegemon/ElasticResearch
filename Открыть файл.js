const FS = require('fs'),
    PATH = require('path');

const clog = console.log.bind(console),
    wlog = console.warn.bind(console),
    elog = console.error.bind(console);

const Helper = (function () {
    function Helper() {
        this.settings = null;
    }

    Helper.prototype.removeDir = function (path) {
        if (FS.existsSync(path)) {
            FS.readdirSync(path).forEach((file, index) => {
                const curPath = PATH.join(path, file);
                if (FS.lstatSync(curPath).isDirectory()) { // recurse
                    this.removeDir(curPath);
                } else { // delete file
                    FS.unlinkSync(curPath);
                }
            });
            FS.rmdirSync(path);
        }
    };

    Helper.prototype.cleanScene = function () {
        for (let i = Model.Count - 1; i > 0; i -= 1) {
            DeleteObject(Model[i]);
        }
    };

    Helper.prototype.roundToDot1 = function (num) {
        return Math.round(parseFloat(num) * 1e1) / 1e1;
    };

    Helper.prototype.roundToDot2 = function (num) {
        return Math.round(parseFloat(num) * 1e2) / 1e2;
    };

    Helper.prototype.loadSettings = function () {
        const _this = this;
        let settings = null;
        try {
            settings = FS.readFileSync('./settings/settings.json');
        } catch (e) {
            this.saveDefaultSettings();
            this.loadSettings();
            return;
        }

        try {
            this.settings = JSON.parse(settings);
        } catch (e) {
            FS.unlinkSync('./settings/settings.json');
            if (!_this.settings['modelsFolderPath']) {
                _this.settings = { modelsFolderPath: 'C:/Users' };
            }
        }
    };

    Helper.prototype.saveDefaultSettings = function () {
        const defaultData = {
            'modelsFolderPath': 'C:/Users'
        };
        this.saveSettings(defaultData);
    };

    Helper.prototype.saveSettings = function (data) {
        FS.writeFileSync('./settings/settings.json', JSON.stringify(data ? data : this.settings));
    };

    Helper.prototype.isExtensionRight = function (path) {
        let ext = PATH.extname(path);
        ext = ext.toLowerCase();
        return ext === '.json';
    };

    Helper.prototype.convertObjectToArray = function (data) {
        const result = [];
        for (let key in data) {
            if (!data.hasOwnProperty(key)) continue;
            result.push(data[key]);
        }
        return result;
    };

    Helper.prototype.getFilePaths = function (filePaths, folder) {
        let path, res = FS.readdirSync(folder, { encoding: 'utf-8', withFileTypes: true });
        for (let i = 0; i < res.length; i += 1) {
            if (folder[folder.length - 1] === '\\') {
                path = folder + res[i];

            } else {
                path = folder + '\\' + res[i];
            }

            if (FS.statSync(path).isDirectory()) {
                filePaths = this.getFilePaths(filePaths, path);
            } else {
                if (!this.isExtensionRight(path)) continue;
                filePaths.push(path);
            }
        }
        return filePaths;
    };

    return new Helper();
})();

const Reader = (function () {
    function Reader() {
        this.data = {};
    }

    Reader.prototype.run = function () {
        Helper.loadSettings();
        this.data = this.read();

        return this.data;
    };

    Reader.prototype.read = function () {
        const filePath = system.askFileName();
        if (filePath === '') return;
        Helper.settings.modelsFolderPath = PATH.dirname(filePath);
        Helper.saveSettings();
        if (!Helper.isExtensionRight(filePath)) {
            alert('Файл не поддерживается!\nПоддерживаемые форматы: .json');
            return null;
        }

        return this.readFile(filePath);
    };

    Reader.prototype.readFile = function (filePath) {
        let data = [];
        try {
            data = FS.readFileSync(filePath);
        } catch (e) {
            elog(e);
            return data;
        }

        try {
            data = JSON.parse(data);
        } catch (e) {
            elog(e);
            return [];
        }

        // data = Helper.convertObjectToArray(data.list);
        return data;
    };

    return new Reader();
})();

const Builder = (function () {
    function Builder() {

    }

    Builder.prototype.build = function (data) {
        //Helper.cleanScene();
        const tree = data.tree;
        for (let i = 0; i < tree.length; i += 1) {
            this.create(tree[i], Model);
        }
    };

    Builder.prototype.create = function (obj, parent) {
        if (obj.type === 'TModelLimits') {

        } else if (obj.type === 'TFurnPanel') {

            const panel = AddPanel(parseFloat(obj.size.width), parseFloat(obj.size.height));
            panel.Thickness = parseFloat(obj.size.depth);
            panel.Name = obj.name;

            panel.PositionX = parseFloat(obj.position.x);
            panel.PositionY = parseFloat(obj.position.y);
            panel.PositionZ = parseFloat(obj.position.z);

            panel.RotateX(parseFloat(obj.rotation.x));
            panel.RotateY(parseFloat(obj.rotation.y));
            panel.RotateZ(parseFloat(obj.rotation.z));


            panel.ReTransform(panel.Owner, parent);
            panel.Owner = parent;
            panel.Build();

        } else if (obj.type === 'TFurnBlock') {
            const block = AddBlock(obj.name);
            block.GSize.x = parseFloat(obj.size.width);
            block.GSize.y = parseFloat(obj.size.height);
            block.GSize.z = parseFloat(obj.size.depth);

            block.PositionX = parseFloat(obj.position.x);
            block.PositionY = parseFloat(obj.position.y);
            block.PositionZ = parseFloat(obj.position.z);

            block.RotateX(parseFloat(obj.rotation.x));
            block.RotateY(parseFloat(obj.rotation.y));
            block.RotateZ(parseFloat(obj.rotation.z));

            if (parent) {
                block.Owner = parent;
            }

            if (obj.elastic.isElastic === 'true') {
                const elasticNode = block.ParamSectionNode('Elastic');
                elasticNode.NodeNew('AreaMax').WriteFloat('x', obj.elastic.constraints.max.x);
                elasticNode.NodeNew('AreaMax').WriteFloat('y', obj.elastic.constraints.max.y);
                elasticNode.NodeNew('AreaMax').WriteFloat('z', obj.elastic.constraints.max.z);

                elasticNode.NodeNew('AreaMin').WriteFloat('x', obj.elastic.constraints.min.x);
                elasticNode.NodeNew('AreaMin').WriteFloat('y', obj.elastic.constraints.min.y);
                elasticNode.NodeNew('AreaMin').WriteFloat('z', obj.elastic.constraints.min.z);

                elasticNode.NodeNew('AreaStep').WriteFloat('x', obj.elastic.constraints.step.x);
                elasticNode.NodeNew('AreaStep').WriteFloat('y', obj.elastic.constraints.step.y);
                elasticNode.NodeNew('AreaStep').WriteFloat('z', obj.elastic.constraints.step.z);

                const planesNode = elasticNode.NodeNew('Planes');

                for (var i = 0; i < obj.elastic.planes.length; i++) {
                    const plane = planesNode.NodeNew('Plane');

                    plane.WriteInteger('Axis', parseInt(obj.elastic.planes[i].axis));
                    plane.WriteInteger('Pos', parseFloat(obj.elastic.planes[i].pos));
                    plane.WriteInteger('Weight', parseFloat(obj.elastic.planes[i].weight));
                }

            }

            obj.children.map((item) => this.create(item, block));
            block.Build();

            clog(block.isElastic());
        }
    };

    return new Builder();
})();

const data = Reader.run();

Builder.build(data);
Action.Commit();
Action.Finish();
