const express = require('express');
const router = express.Router();
const fs = require('fs');
const util = require('util');
const formidable = require('formidable');
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;

router.get('/down/:file', (req, res) => {
  fs.readFile(prj.UPLOAD_PATH + '/' + req.params.file, "binary", (error, file) => {
    if (error) {
      return res.status(gstate.RC_INTERNAL_ERR).send({
        desc: error
      });
    } else {
      res.write(file, "binary");
      res.end();
    }
  });
});

router.get('/upload', (req, res) => {
  let body = '<html>' + '<head>' + '<meta http-equiv="Content-Type" ' + 'content="text/html; charset=UTF-8" />' + '</head>' +
    '<body>' +
    '<form action="/file/upload" enctype="multipart/form-data" ' + 'method="post">' +
    '<input type="file" name="file">' +
    '<input type="submit" value="Upload file" />' +
    '</form>' +
    '</body>' +
    '</html>';

  res.writeHead(gstate.RC_OK, {
    "Content-Type": "text/html"
  });
  res.write(body);
  res.end();
});

router.post('/upload', (req, res) => {
  let form = new formidable.IncomingForm();
  form.parse(req, (error, fields, files) => {
    // ddbg(files);
    let file = files.file; // it coube be files.upload, files.name...etc
    let writeStream = fs.createWriteStream(prj.UPLOAD_PATH + '/' + file.name);
    writeStream.on('error', (err) => {
      res.status(gstate.RC_INTERNAL_ERR).send({
        desc: err
      });
    });

    let readStream = fs.createReadStream(file.path);
    readStream.pipe(writeStream, {
      end: false
    });
    readStream.on('error', (err) => {
      fs.unlinkSync(file.path);
      res.status(gstate.RC_INTERNAL_ERR).send({
        desc: err
      });
    }).on('data', (chunk) => {
      // dbg('got %d bytes of data', chunk.length);
    }).on('end', () => {
      fs.unlinkSync(file.path);
      res.status(gstate.RC_OK).send({
        link: '/file/down/' + file.name
      });
    });
  });
});

module.exports = router;
