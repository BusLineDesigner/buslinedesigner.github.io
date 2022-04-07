const app = Vue.createApp({
    setup() {
        const blankLineFile = {
            "fileVersion": 1,
            "cityName": "",
            "lineName": "",
            "remark": "",
            "lineType": 1,
            "company": "",
            "route": {
                "up": [],
                "down": []
            },
            "fare": {}
        };
        return{
            blankLineFile,
        }
    },
    data() {
        return {
            currentTab: 'stations',
            tabs: [
                {id: 'stations', name: '设站'},
                {id: 'fare', name: '票价'},
                {id: 'schematic', name: '图示'},
                {id: 'about', name: '关于'}
            ],
            lineFile: deepClone(this.blankLineFile),
            fileInput: null,
            fileReader: null,
            clipboard: new ClipboardJS('#copyLine'),
            toast: {
                title: '',
                subtitle: '',
                content: '',
                autohide: true
            }
        }
    },
    mounted() {
        window.onbeforeunload = function(e) {
            var e = window.event || e;
            e.returnValue = ("确定离开页面吗？现有线路内容将丢失。请确保已保存当前线路。");
        };
        this.clipboard.on('success', this.copyLine);
        this.clipboard.on('error', this.copyLineFailed);
        this.fileInput = document.createElement('input');
        this.fileInput.setAttribute('type', 'file');
        this.fileInput.addEventListener('change', this.readFile);
        this.fileReader = new FileReader();
        this.fileReader.addEventListener('load', this.loadLineFromFile);
    },
    methods: {
        setTab(tabId) {
            this.currentTab = tabId;
        },
        loadLineFromReality(){
            if(!confirm("确定读取线路吗？现有线路内容将丢失。请确保已保存当前线路。")){
                return;
            }
            var lineName = prompt("线路名称：");
            var city = prompt("线路所在城市名称或行政编码：(选填)");
            var lineSearch = new AMap.LineSearch({
                pageIndex: 1,
                pageSize: 1,
                city: city,
                extensions: "all"
            });
            lineSearch.search(lineName, this.getLineFromRealityUp);
        },
        getLineFromRealityUp(status, result){
            if(status != "complete"){
                this.showMessage("读取线路", "", "读取线路失败 (" + status + ")！", false);
                return;
            }else{
                this.lineFile = deepClone(this.blankLineFile);
                var line = result.lineInfo[0];

                this.lineFile.lineName = line.name.replace(/\(.*\)$/, '').replace("内环", "").replace("外环", "").replace("内圈", "").replace("外圈", "");
                this.lineFile.company = line.company;
                var isBilateral = (line.direc != line.id);
                this.lineFile.lineType = line.loop * 2 + !isBilateral * 1 + 1;
                this.setStationFromReality('up', line.path, line.via_stops);
                if(isBilateral){
                    var lineSearch = new AMap.LineSearch({
                        pageIndex: 1,
                        pageSize: 1,
                        city: city,
                        extensions: "all"
                    });
                    lineSearch.searchById(line.direc, this.getLineFromRealityDown);
                }else{
                    this.loadLine();
                    this.showMessage("读取线路", "", "成功读取现有线路内容。");
                }
                return;
            }
        },
        getLineFromRealityDown(status, result){
            if(status != "complete"){
                this.loadLine();
                this.showMessage("读取线路", "", "读取线路下行失败 (" + status + ")！", false);
                return;
            }else{
                var line = result.lineInfo[0];
                this.setStationFromReality('down', line.path, line.via_stops);
                this.loadLine();
                this.showMessage("读取线路", "", "成功读取现有线路内容。");
                return;
            }
        },
        setStationFromReality(direction, path, stations){
            var route = this.lineFile.route[direction];
            var stationCount = 0;
            path.forEach((node, index) => {
                var newNode;
                if(stations[stationCount].location.getLng() == node.getLng() && stations[stationCount].location.getLat() == node.getLat()){
                    newNode = {
                        'type': 'station',
                        'name': stations[stationCount].name,
                        'lng': stations[stationCount].location.getLng(),
                        'lat': stations[stationCount].location.getLat()
                    };
                    stationCount ++;
                }else{
                    newNode = {
                        'type': 'waypoint',
                        'name': '途经点 #' + Math.abs(CRC32C.str('(' + node.getLng() + ',' + node.getLat() + ')')).toString(16).toUpperCase(),
                        'lng': node.getLng(),
                        'lat': node.getLat()
                    };
                }
                route.splice(index, 0, newNode);
            });
        },
        loadLine() {
            this.$refs.tabStation.loadLine();
        },
        loadLineFromFile(){
            try{
                this.lineFile = deepClone(JSON.parse(this.fileReader.result));
            }catch(e){
                this.showMessage("读取线路", "", "读取线路失败！" + e, false);
                return;
            }
            this.loadLine();
            this.showMessage("读取线路", "", "成功读取文件中的线路。");
        },
        uploadLine() {
            if(confirm("确定读取线路吗？现有线路内容将丢失。请确保已保存当前线路。")){
                this.getFile();
            }
        },
        getFile() {
            if(document.createEvent) {
                var event = document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                this.fileInput.dispatchEvent(event);
            }
            else {
                this.fileInput.click();
            }
        },
        readFile() {
            if(!this.fileInput.files.length){
                return;
            }
            this.fileReader.readAsText(this.fileInput.files[0]);
        },
        loadLineFromClipboard(line){
            this.lineFile = deepClone(JSON.parse(line));
            this.loadLine();
            this.showMessage("读取线路", "", "成功读取剪贴板中的线路。");
        },
        newLine() {
            if(confirm("确定新建线路吗？现有线路内容将丢失。请确保已保存当前线路。")){
                this.lineFile = deepClone(this.blankLineFile);
                this.loadLine();
                this.showMessage("新建线路", "", "成功新建空白线路。");
            }
        },
        downloadLine() {
            this.showMessage("保存线路", "", "已尝试保存线路到文件。如保存失败，请尝试保存到剪贴板。", false);
            this.downloadFile(
                (this.lineFile.lineName.length?this.lineFile.lineName:'未命名线路') + '.bll',
                JSON.stringify(this.lineFile)
            );
        },
        copyLine() {
            this.showMessage('保存线路', '', '线路信息已保存至剪贴板。');
        },
        copyLineFailed() {
            this.showMessage('保存线路', '', '线路信息保存失败，请手动复制：<br />'.JSON.stringify(lineFile));
        },
        pasteLine() {
            this.showMessage("读取线路", "", "已尝试从剪贴板读取线路。如读取失败，请尝试将内容保存到文件中，再从文件读取。", false);
            navigator.clipboard.readText().then(this.loadLineFromClipboard);
        },
        showMessage(title, subtitle, content, autohide = true) {
            this.toast.title = title;
            this.toast.subtitle = subtitle;
            this.toast.content = content;
            this.toast.autohide = autohide;
            var t = new bootstrap.Toast(document.getElementById("liveToast"));
            t.show();
        },
        downloadFile(filename, text) {
            var pom = document.createElement('a');
            var blob = new Blob([text], {type: "application/json"});
            pom.setAttribute('href', URL.createObjectURL(blob));
            pom.setAttribute('download', filename);
            pom.click();
        },
    }
})