const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const padZero = require(prj.LIB_PATH + '/utils').padZero;
const toIOname = require(prj.LIB_PATH + '/ioinfo').toIOname;
const toAIOname = require(prj.LIB_PATH + '/ioinfo').toAIOname;
const model = require(prj.ROOT_PATH + '/public/js/model');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;

const IOBASE = {
  'OP' : 0x0000,
  'X'  : 0x0100,
  'Y'  : 0x0300,
  'A'  : 0x0500,
  'WX' : 0x0700,
  'WY' : 0x0900,
  'WA' : 0x0B00,
  'T'  : 0x0D00,
  'M'  : 0x0F00,
  'CS' : 0x1500,
  'CC' : 0x1600,
  'RX' : 0x1700,
  'SCH': 0x1800,
  'XY' : 0x1A00,
  'RY' : 0x1C00,
  'F'  : 0x1F00,
  '-'  : 0x2000,
};

const AIOBASE = {
  0x80 : 'X',
  0x81 : 'Y',
  0x82 : 'XY',
  0x83 : 'AI',
  0x84 : 'AO',
  0x85 : 'T',
  0x86 : 'CS',
  0x87 : 'CC',
  0x88 : 'HCS',
  0x89 : 'HCC',
  0x8A : 'PO',
  0x8B : 'HT',
  0x8C : 'M',
  0x8D : 'Reserved',
  0x8E : 'Reserved',
  0x8F : 'SCH',
  0x90 : 'F',
  0x91 : 'RX',
  0x92 : 'RY',
  0x93 : 'RAI',
  0x94 : 'RAO',
  0x95 : 'N',
  0x96 : 'AILN',
  0x97 : 'TONN',
  0x98 : 'CSN',
  0x99 : 'PON',
  0x9A : 'HTONN',
  0x9B : 'HCSD',
  0x9C : 'D',
  0x9D : 'Reserved',
  0x9E : 'AIUN',
  0x9F : 'TOFFN',
  0xA0 : 'HTOFFN',
  0xA1 : 'MBRCS',
  0xA2 : 'MBRIS',
  0xA3 : 'MBRHR',
  0xA4 : 'MBRIR',
  0xA5 : 'MBFSC',
  0xA6 : 'MBPSR',
  0xA7 : 'SPORT',
  0xA8 : 'Reserved',
};

module.exports.toIOnum = (io, port) => {
  return IOBASE[io] + port;
};

module.exports.toIOname = (cid) => {
  cid = parseInt(cid);
  let ios = Object.keys(IOBASE);
  for(let i = 1; i < ios.length ; i++) {
    if(cid < IOBASE[ios[i]]) {
      return {
        comp: ios[i-1],
        port: (cid - IOBASE[ios[i-1]]),
      };
    }
  }
  return {
    comp: 'Unknown',
    port: -1,
  };
};

module.exports.toAIOname = (cid) => {
  cid = parseInt(cid);
  return {
    board: cid & 0x400, //cid & 0x3c00,
    comp: AIOBASE[parseInt('0x' + parseInt((cid >> 14) & 0xff).toString(16).toUpperCase(), 16)],
    port: cid & 0x1ff, //cid & 0x3ff,
  };
};

//  data:
//  default : '3,00,00,00' -> 0001010101011010
//      RX2 : '256,000000' -> 0001010101010000
module.exports.toIObinStr = (data, type) => {
  if(!data) {
    return;
  } else if(type && type.match(/R[X|Y]2/i) ) {
    return data.split(',')[1];
  }
  let result = '';
  let datas = data.split(',');
  let nBytes = datas[0];
  datas.shift();
  for(let i = 0; i < nBytes; i++) {
    let byteStr = padZero(parseInt(datas[i], 16).toString(2), 8);
    result += byteStr.split('').reverse().join('');
  }
  return result;
};

//  data:
//  default : '3,00,00,00' <- 0001010101011010
//      RX2 : '256,000000' <- 0001010101010000
module.exports.toIOByteStr = (data, type) => {
  if(!data) {
    return;
  } else if(type && type.match(/R[X|Y]2/i) ) {
    return data.length + ',' + data;
  }

  let nBytes = 0;
  let result = '';
  data = (typeof data === 'string') ? data.split('') : data;
  for(let i = 0; i < data.length; i += 8) {
    let ioBinVal = data.slice(i, (i + 8));
    ioBinVal = ioBinVal.reverse().join('');
    result += ',' + padZero(parseInt(ioBinVal,2).toString(16).toUpperCase(),2);
    nBytes++;
  }
  return nBytes + result;
};

//  data0: '0,aa00,1,ca01,2,ac45,3,d124, ....' -> {0:aa00, 1:ca01, 2:ac45, 3:d124, ....}
module.exports.toIOPortMap = (data) => {
  if(!data) {
    return;
  }
  let result = {};
  let datas = data.split(',');
  for(let i = 0; i < datas.length ; i = i + 2) {
    result[datas[i]] = padZero(datas[i+1].toString().toUpperCase(), 4);
  }
  return result;
};

//  data0: {0:aa00, 1:ca01, 2:ac45, 3:d124, ....} -> '0,aa00,1,ca01,2,ac45,3,d124, ....'
module.exports.toIOPortStr = (data) => {
  if(!data || (typeof data !== "object")) {
    return;
  }
  let resStr = '';
  Object.keys(data).forEach((port, idx) => {
    resStr = (resStr) ? (resStr + ',') : resStr ;
    resStr = resStr + (port + ',' + padZero(data[port].toString().toUpperCase(), 4));
  });
  return resStr;
};

//  data: '3,00,00,00' -> 0001010101011010
module.exports.getIOVal = (data, port, type) => {
  let ioBinStr = module.exports.toIObinStr(data, type);
  if(port >= ioBinStr.length) {
    dbg(__file + ':' + __line + ' Port out of range (' + port + ' >= ' + ioBinStr.length + ')');
    return;
  }
  return ioBinStr[port];
};

//  data: '3,00,00,00' -> 0001010101011010 -> '3,01,00,00'
//  vals: [{port1, val1}, {port2, val2} ...];
const setRXVal = (data, vals, type) => {
  if(!vals) {
    return data;
  }
  if(!Array.isArray(vals)){
    vals = [vals];
  }
  let nBytes = data.split(',')[0];
  nBytes = (nBytes < 1) ? (1) : nBytes;
  let ioBinStr = module.exports.toIObinStr(data, type);
  let ioBinStrs = ioBinStr.split('');

  while(vals.length > 0) {
    let ioInfo = vals.pop();
    ioBinStrs[ioInfo.port] = ioInfo.val;
  }
  return module.exports.toIOByteStr(ioBinStrs);
};

//  data: 25,1001010101011010 -> 0001010101011010 -> 25,1001010101011010
//  vals: [{port1, val1}, {port2, val2} ...];
const setRX2Val = (data, vals) => {
  if(!vals) {
    return data;
  }
  if(!Array.isArray(vals)){
    vals = [vals];
  }
  data = data.split(',')[1];
  let ioBinStrs = data.split('');
  vals.forEach((val, idx) => {
    ioBinStrs[val.port] = val.val;
  });
  return ioBinStrs.length + ',' + ioBinStrs.join('');
};

//  data: '000101101001111'
//  vals: 0,0,1,1,2,1,3,0,4,1,5,1,... (string)
//  vals: [{port1, val1}, {port2, val2} ...];
//
//  return -> '000101101001111'
const setRX3Val = (data, vals) => {
  if(!vals) {
    return data;
  } else if(!data) {
    info(__file + ':' + __line + ' Error !! No original RX data ' + data);
  }
  if(typeof vals === 'object') {
    if(!Array.isArray(vals)){
      vals = [vals];
    }
    vals.forEach((val, idx) => {
      // dbg(__file + ':' + __line + ' Set port ' + val.port + ' val: ' + val.val);
      data = data.replaceAt(val.port, val.val);
    });
  } else { // string
    vals = vals.split(',');
    for(let i = 0; i < vals.length; i = i + 2) {
      data = data.replaceAt(vals[i], vals[i+1]);
    }
  }
  return data;
};

//  data0: '0,aa00,1,ca01,2,ac45,3,d124, ....'
//  data1: {0:aa00, 1:ca01, 2:ac45, 3:d124, ....}
//  vals: [{port1, val1}, {port2, val2} ...];
//
//  return: {0:aa00, 1:ca01, 2:ac45, 3:d124, ....}
const setRAIVal = (data, vals) => {
  if(!vals) {
    return data;
  }

  if(!Array.isArray(vals)){
    vals = [vals];
  }

  if(typeof data === 'string') {
    data = module.exports.toIOPortMap(data);
  }

  vals.forEach((val, idx) => {
    data[val.port] = padZero(val.val.toString().toUpperCase(), 4);
  });
  // return module.exports.toIOPortStr(data);
  return data;
};

//  data: 0,10ef,1,221e,2,9ac9,...
//  vals: [{port1, val1}, {port2, val2} ...];
module.exports.setIOVal = (type, data, vals) => {
  if(type.match(/RA[I|O]/i)) {
    return setRAIVal(data, vals);
  } else if(type.match(/R[X|Y]3/i)) {
    return setRX3Val(data, vals);
  } else if(type.match(/R[X|Y]2/i)) {
    return setRX2Val(data, vals);
  } else if(type.match(/R[X|Y]/i)) {
    return setRXVal(data, vals);
  } else { // 101101010 -> 011010101
    dbg(__file + ':' + __line + ' Unknow I/O type');
    return data;
  }
};

module.exports.isBitIO = (mo, ioName) => {
  if(model.isSIOPlus(mo)) { // Advanced I/O
    if(ioName.match(/\dAI|\dAO|\dHC|\dXY|C|X2|Y2|XY2|RX2|RX3|RY2|RY3|RAI|RAO/)) {
      return false;
    } else {
      return true;
    }
  } else { // Smart I/O
    if(ioName === 'C' || ioName === 'A') {
      return false;
    } else {
      return true;
    }
  }
};

// data1 : 10110010
// data2 : 10100100
//
// return: [{port:,val:},{port:,val:}...]
//
module.exports.findDiffBits = (data1, data2) => {
  let results = [];
  if(data1.length !== data2.length) {
    info(__file + ':' + __line + ' Cannot compare two data with different length');
    return results;
  }
  for(let i = 0; i < data1.length; i = i + 1) {
    let val1 = parseInt(data1[i]);
    let val2 = parseInt(data2[i]);
    if(val1 !== val2) {
      results.push({
        port: i,
        val: val2,
      });
    }
  }
  return results;
};

// data1 : {0:a1b1, 1:a1b1, 2:123, 3:2121 ...}
// data2 : {0:a1b1, 1:a1b1, 2:123, 3:2121 ...}
//
// return: [{port:,val:},{port:,val:}...]
//
module.exports.findDiffPorts = (data1, data2) => {
  let results = [];
  let datas1 = Object.keys(data1);
  let datas2 = Object.keys(data2);
  if(datas1.length !== datas2.length) {
    info(__file + ':' + __line + ' Cannot compare two data with different length');
    return results;
  }
  datas1.forEach((port, idx) => {
    if(data1[port] !== data2[port]) {
      results.push({
        port: port,
        val: data2[port],
      });
    }
  });
  return results;
};
