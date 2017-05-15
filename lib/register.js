const prj = require('../project');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const db = require(prj.LIB_PATH + '/db');
const csid = require(prj.LIB_PATH + '/csid');
const gstate = require(prj.GSTATE_PATH);
const device = require(prj.LIB_PATH + '/device');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const register = require(prj.LIB_PATH + '/register');
const mbval = require(prj.LIB_PATH + '/mbval');
const utils = require(prj.LIB_PATH + '/utils');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const async = require('asyncawait/async');
const await = require('asyncawait/await');

const hexToDec = (hexString, charLoc) => {
  return "0123456789ABCDEF".indexOf(hexString.charAt(charLoc));
};

const padF = (num, size) => {
  let s = num + '';
  while (s.length < size) {
    s = 'f' + s;
  }
  return s;
};

const padZero = (num, size) => {
  let s = num + '';
  while (s.length < size) {
    s = '0' + s;
  }
  return s;
};

const ieee754Decode = (hexVal) => {
  hexVal = hexVal.toUpperCase();
  let translate = [
    "0000", "0001", "0010", "0011", "0100", "0101", "0110", "0111",
    "1000", "1001", "1010", "1011", "1100", "1101", "1110", "1111"
  ];

  // Render in binary.  Hackish.
  let b = "";
  for (let i = 0, n = hexVal.length; i < n; i++) {
    b += translate[hexToDec(hexVal,i)];
  }

  // Determine configuration.  This could have all been precomputed but it is fast enough.
  let exponentBits = hexVal.length === 8 ? 8 : 11;
  let mantissaBits = (hexVal.length * 4) - exponentBits - 1;
  let bias = Math.pow(2, exponentBits - 1) - 1;
  let minExponent = 1 - bias - mantissaBits;
  let allZeros = /^0+$/;
  let allOnes = /^1+$/;

  // Break up the binary representation into its pieces for easier processing.
  let data = {};
  let s = data.sign || b[0];
  let e = data.exponent || b.substring(1, exponentBits + 1);
  let m = data.mantissa || b.substring(exponentBits + 1);

  let value = 0;
  let multiplier = (s === "0" ? 1 : -1);
  if (allZeros.test(e)) { // Zero or denormalized
    if (!allZeros.test(m)) {
      let firstOneIndex = m.indexOf("1");
      value = parseInt(m, 2) * Math.pow(2, minExponent);
      value = value * multiplier;
    }
  } else if (allOnes.test(e)) { // Infinity or NaN
    if (allZeros.test(m)) {
      value = Infinity;
    } else {
      value = NaN;
    }
  } else { // Normalized
    let exponent = parseInt(e, 2) - bias;
    let mantissa = parseInt(m, 2);
    value = (1 + (mantissa * Math.pow(2, -mantissaBits))) * Math.pow(2, exponent);
    value = value * multiplier;
  }
  return value;
};

const ieee754Encode = (decVal) => {
  decVal = new Uint8Array((new Float32Array([decVal])).buffer);
  let littleEndian = !!(new Uint8Array((new Uint32Array([1])).buffer))[0];
  let array = [];
  for (let i = 0; i < decVal.length; i++) {
    array[littleEndian ? "unshift" : "push"](decVal[i]); // couldn't resist writing this.
  }
  return array.map((byte) => {
    let hex = byte.toString(16);
    return hex.length === 1 ? "0" + hex : "" + hex;
  }).join("");
};

// conf { type: ,hval: ,fpt: ,doShift: }
const toDec16Val = (conf) => {
  if(typeof conf.hval === 'undefined') {
    return;
  }
  try {
    let val;
    let type = conf.type;
    if(iotype.isBinary(type)) { // binary
      val = padZero(parseInt(conf.hval, 16).toString(2), 16);
    } else if(iotype.isSigned(type)) {
      val = parseInt(conf.hval, 16);
      if(padZero(val.toString(2), 16)[0] === '1') {
        val = 0xffff0000 | val;
        val = (~val + 1) * -1;
      }
    } else { // 16bits unsigned int, Alarm, Btn, Switch
      val = parseInt(conf.hval, 16);
    }
    // Handle fix points if have
    if(iotype.isFixPoint(type) && conf.fpt > 0) { // fix Point
      val = (conf.noShift) ? val : (val / Math.pow(10, conf.fpt)).toFixed(conf.fpt);
    }        
    return val;
  } catch(e) {
    info(e.stack);
  }
};
module.exports.toDec16Val = toDec16Val;

// conf { type: ,hval: ,lval: ,fpt: ,doShift: }
const toDec32Val = (conf) => {
  if(typeof conf.hval === 'undefined' ||
     typeof conf.lval === 'undefined') {
    return;
  }
  try {
    let val;
    let type = conf.type;
    let hval = padZero(conf.hval, 4);
    let lval = padZero(conf.lval, 4);
    if(iotype.isIEEE754(type)) {
      val = ieee754Decode(hval + lval);
      // val = (fpt > 0) ? Math.round((val * Math.pow(10, fpt))) / Math.pow(10, fpt) : val ;
    } else if(iotype.isSigned(type)) {
      val = utils.hexToInt(hval + lval);            
    } else { // 32bits unsigned int
      val = parseInt(hval + lval, 16);
    }
    // Handle fix points if have
    if(iotype.isFixPoint(type) && conf.fpt > 0) { // fix Point
      val = (conf.noShift) ? val : (val / Math.pow(10, conf.fpt)).toFixed(conf.fpt);
    }        
    return val;
  } catch(e) {
    info(e.stack);
  }
};
module.exports.toDec32Val = toDec32Val;

// conf { type: ,hval: ,ival:, lval: ,fpt: ,doShift: }
const toDec48Val = (conf) => {
  if(typeof conf.hval === 'undefined' ||
     typeof conf.ival === 'undefined' ||
     typeof conf.lval === 'undefined') {
    return;
  }
  try {
    let type = conf.type;
    let val = parseInt(conf.hval, 16) * 1000 + parseInt(conf.ival, 16) + parseInt(conf.lval, 16) / 1000;
    if(iotype.isFixPoint(type) && conf.fpt > 0) { // fix Point
      let _shift = Math.pow(10, conf.fpt);
      val = Math.floor((val * _shift), conf.fpt) / _shift;
    }
    if(conf.noShift) {
      val = val * 1000;
    }
    return val;
  } catch(e) {
    info(e.stack);
  }
};
module.exports.toDec48Val = toDec48Val;

// conf { type: ,hval: ,lval: ,fpt: ,doShift: }
const toDec64Val = (conf) => {
  if(typeof conf.hval === 'undefined' ||
     typeof conf.ival === 'undefined' ||
     typeof conf.jval === 'undefined' ||
     typeof conf.lval === 'undefined') {
    return;
  }
  try {
    let val;
    let type = conf.type;
    let val1 = padZero(conf.hval, 2);
    let val2 = padZero(conf.ival, 4);
    let val3 = padZero(conf.jval, 4);
    let val4 = padZero(conf.lval, 4);
    if(iotype.isSigned(type)) {
      val = utils.hexToInt64(val1 + val2 + val3 + val4);
    } else { // 64bits unsigned int
      val = parseInt(val1 + val2 + val3 + val4, 16);            
    }
    if(iotype.isFixPoint(type) && conf.fpt > 0) { // fix Point
      val = (conf.noShift) ? val : (val / Math.pow(10, conf.fpt)).toFixed(conf.fpt);
    }        
    return val;
  } catch(e) {
    info(e.stack);
  }
};
module.exports.toDec64Val = toDec64Val;

// Calc from mbus tables
const toDecVal = (dbsIdx, sn, addr, noShift) => {
  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  if(!ctrlData) { return; }
  try {
    let val;
    let haddr = addr;
    let hval = await(mbval.get(dbsIdx, sn, addr));
    if(!hval) { return; }

    let type = ctrlData[addr].type;
    let conf = {
      type: type,
      hval: hval,
      noShift: (noShift) ? true : false,
    };

    // Fix point
    if(typeof ctrlData[haddr].fpt !== 'undefined') {
      conf.fpt = ctrlData[haddr].fpt;
    }

    // If usnig I/O switch
    if(iotype.isIOSW(type)) {
      let swSN = mac2hex(ctrlData[addr].swSN);
      let swAddr = ctrlData[addr].swAddr;
      let swCtrlData = await(ctrlblk.get(dbsIdx, swSN));
      if(swCtrlData && swCtrlData[swAddr]) {
        conf.type = swCtrlData[swAddr].type;
        if(typeof swCtrlData[swAddr].fpt !== 'undefined') {
          conf.fpt = swCtrlData[swAddr].fpt;
        }
      }
    }

    if(iotype.is64bit(type)) {
      for(let [_addr, _val] of [['iaddr','ival'], ['jaddr','jval'], ['laddr','lval']]) {
        let val = await(mbval.get(dbsIdx, sn, ctrlData[addr][_addr]));
        if(utils.has(val)) { 
          conf[_val] = val; 
        } else {
          return;
        }
      }
      val = toDec64Val(conf);            
    } else if(iotype.is48bit(type)) {
      for(let [_addr, _val] of [['iaddr','ival'], ['laddr','lval']]) {
        let val = await(mbval.get(dbsIdx, sn, ctrlData[addr][_addr]));
        if(utils.has(val)) { 
          conf[_val] = val; 
        } else {
          return;
        }
      }
      val = toDec48Val(conf);              
    } else if(iotype.is32bit(type)) {
      let laddr = ctrlData[addr].laddr;
      let lval = await(mbval.get(dbsIdx, sn, laddr));
      if(utils.has(lval)) { 
        conf.lval = lval;
        val = toDec32Val(conf);
      } 
    } else { // 16 bits
      val = toDec16Val(conf);
    }
    return val;
  } catch(e) {
    info(e.stack);
  }
};
module.exports.toDecVal = toDecVal;
