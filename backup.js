/* Code to handle Backup/Restore functionality */

const BACKUP_STORAGEFILE_DIR = "storage-files";

function bangleDownload() {
  var zip = new JSZip();
  Progress.show({title:"Scanning...",sticky:true});
  var normalFiles, storageFiles;
  console.log("Listing normal files...");
  Comms.reset()
  .then(() => Comms.showMessage("Backing up..."))
  .then(() => Comms.listFiles({sf:false}))
  .then(f => {
    normalFiles = f;
    console.log(" - "+f.join(","));
    console.log("Listing StorageFiles...");
    return Comms.listFiles({sf:true});
  }).then(f => {
    storageFiles = f;
    console.log(" - "+f.join(","));
    var fileCount = normalFiles.length + storageFiles.length;
    var promise = Promise.resolve();
    // Normal files
    normalFiles.forEach((filename,n) => {
      if (filename==".firmware") {
        console.log("Ignoring .firmware file");
        return;
      }
      promise = promise.then(() => {
        Progress.hide({sticky: true});
        var percent = n/fileCount;
        Progress.show({title:`Download ${filename}`,sticky:true,min:percent,max:percent+(1/fileCount),percent:0});
        return Comms.readFile(filename).then(data => zip.file(filename,data));
      });
    });
    // Storage files
    if (storageFiles.length) {
      var zipStorageFiles = zip.folder(BACKUP_STORAGEFILE_DIR);
      storageFiles.forEach((filename,n) => {
        promise = promise.then(() => {
          Progress.hide({sticky: true});
          var percent = (normalFiles.length+n)/fileCount;
          Progress.show({title:`Download ${filename}`,sticky:true,min:percent,max:percent+(1/fileCount),percent:0});
          return Comms.readStorageFile(filename).then(data => zipStorageFiles.file(filename,data));
        });
      });
    }
    return promise;
  }).then(() => {
    return Comms.showMessage(Const.MESSAGE_RELOAD);
  }).then(() => {
    return zip.generateAsync({type:"binarystring"});
  }).then(content => {
    Progress.hide({ sticky: true });
    showToast('Backup complete!', 'success');
    Espruino.Core.Utils.fileSaveDialog(content, "Banglejs backup.zip");
  }).catch(err => {
    Progress.hide({ sticky: true });
    showToast('Backup failed, ' + err, 'error');
  });
}

function bangleUpload() {
  Espruino.Core.Utils.fileOpenDialog({
      id:"backup",
      type:"arraybuffer",
      mimeType:".zip,application/zip"}, function(data) {
    if (data===undefined) return;
    var promise = Promise.resolve();
    var zip = new JSZip();
    var cmds = "";
    zip.loadAsync(data).then(function(zip) {
      return showPrompt("Restore from ZIP","Are you sure? This will remove all existing apps");
    }).then(()=>{
      Progress.show({title:`Reading ZIP`});
      zip.forEach(function (path, file){
        console.log("path");
        promise = promise
        .then(() => file.async("string"))
        .then(data => {
          console.log("decoded", path);
          if (path.startsWith(BACKUP_STORAGEFILE_DIR)) {
            path = path.substr(BACKUP_STORAGEFILE_DIR.length+1);
            cmds += AppInfo.getStorageFileUploadCommands(path, data)+"\n";
          } else if (!path.includes("/")) {
            cmds += AppInfo.getFileUploadCommands(path, data)+"\n";
          } else console.log("Ignoring "+path);
        });
      });
      return promise;
    })
    .then(() => {
      Progress.hide({sticky:true});
      Progress.show({title:`Erasing...`});
      return Comms.removeAllApps(); })
    .then(() => {
      Progress.hide({sticky:true});
      Progress.show({title:`Restoring...`, sticky:true});
      return Comms.showMessage(`Restoring...`); })
    .then(() => Comms.write("\x10"+Comms.getProgressCmd()+"\n"))
    .then(() => Comms.uploadCommandList(cmds, 0, cmds.length))
    .then(() => Comms.showMessage(Const.MESSAGE_RELOAD))
    .then(() => {
      Progress.hide({sticky:true});
      showToast('Restore complete!', 'success');
    })
    .catch(err => {
      Progress.hide({sticky:true});
      showToast('Restore failed, ' + err, 'error');
    });
    return promise;
  });
}

window.addEventListener('load', (event) => {
  document.getElementById("downloadallapps").addEventListener("click",event=>{
    bangleDownload();
  });
  document.getElementById("uploadallapps").addEventListener("click",event=>{
    bangleUpload();
  });
});
