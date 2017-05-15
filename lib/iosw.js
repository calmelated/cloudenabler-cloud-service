const prj = require('../project');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const gstate = require(prj.GSTATE_PATH);
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const model = require(prj.ROOT_PATH + '/public/js/model');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const csid = require(prj.LIB_PATH + '/csid');
const mcache = require(prj.LIB_PATH + '/mcache');
const device = require(prj.LIB_PATH + '/device');
const utils = require(prj.LIB_PATH + '/utils');
const db = require(prj.DB_PATH);

module.exports.set = (dbsIdx, sn, addr, swSN, swAddr) => {
  let qStr = 'INSERT INTO `' + db.TB_IOSW + '` (`sn`,`addr`,`swSN`,`swAddr`) VALUES (UNHEX(\'' + sn + '\'),\'' + addr + '\',UNHEX(\'' + swSN + '\'),\'' + swAddr + '\') ON DUPLICATE KEY UPDATE `swSN` = VALUES(`swSN`),`swAddr` = VALUES(`swAddr`);';   
  await(db.pr_wquery(dbsIdx, qStr));
};

module.exports.remove = (dbsIdx, sn, addr) => {
  let qStr = '';
  if(addr) {
    qStr += 'DELETE FROM `' + db.TB_IOSW + '` WHERE `sn` = UNHEX(\'' + sn + '\') AND `addr` = ' + addr + ';';  
    qStr += 'DELETE FROM `' + db.TB_IOSW + '` WHERE `swSN` = UNHEX(\'' + sn + '\') AND `swAddr` = ' + addr + ';';  
  } else {
    qStr += 'DELETE FROM `' + db.TB_IOSW + '` WHERE `sn` = UNHEX(\'' + sn + '\');';  
    qStr += 'DELETE FROM `' + db.TB_IOSW + '` WHERE `swSN` = UNHEX(\'' + sn + '\');';  
  }
  await(db.pr_wquery(dbsIdx, qStr));
};

module.exports.inFastPT = (dbsIdx, sn) => {
  let qStr = '';
  qStr += 'SELECT `sn` FROM `' + db.TB_IOSW + '` WHERE `sn` = UNHEX(\'' + sn + '\') LIMIT 1 ';
  qStr += 'UNION SELECT `sn` FROM `' + db.TB_IOSW + '` WHERE `swSN` = UNHEX(\'' + sn + '\') LIMIT 1;';
  
  let result = await(db.pr_query(dbsIdx, qStr));
  return (result.err || result.data.length === 0) ? false : true ;
};
