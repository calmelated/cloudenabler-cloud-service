const prj = require('./project');
const csid = {};

// configuration
csid.C = {};
csid.C.PRODUCT_NAME = prj.PRODUCT_NAME;
csid.C.SESSION_AGE = prj.SESSION_AGE; //10 mins
csid.C.SESSION_SECRET = prj.SESSION_SECRET;

csid.C.DUMP_REGISTERS = ''; // [28656bb000001:40001, 28656b000002:40002]
csid.C.OFFLINE_TIMEOUT = 180000; // sec
csid.C.IOSW_STAMP = 0;
csid.C.NETWORK_TYPE = 'DHCP';  // 0, DHCP -> DHCP; 1, Static -> Static IP
csid.C.STATIC_IP = '';
csid.C.STATIC_MASK = '';
csid.C.STATIC_GW = '';
csid.C.STATIC_DNS1 = '';
csid.C.STATIC_DNS2 = '';

csid.C.SYS_TIME_AUTO = '1';
csid.C.SYS_TIME_ZONE = 'Asia/Taipei';
csid.C.SYS_TIME_SERV = 'time.stdtime.gov.tw';
csid.C.SYS_TIME_MANUAL = '100114302014'; // 2014-10-1 14:30

csid.C.FTP_CLI_HOST = '';
csid.C.FTP_CLI_PORT = 21;
csid.C.FTP_CLI_USER = '';
csid.C.FTP_CLI_PSWD = '';

csid.C.SMTP_HOST = prj.SMTP_HOST;
csid.C.SMTP_PORT = prj.SMTP_PORT;
csid.C.SMTP_USER = prj.SMTP_USER;
csid.C.SMTP_PSWD = prj.SMTP_PSWD;

csid.C.MAX_COMPANY = prj.MAX_COMPANY;
csid.C.MAX_ALARM_PER_DAY = 300;
csid.C.MAX_USER = 50;
csid.C.MAX_DEVICE = 100;
csid.C.MAX_SLVDEV = 9;
csid.C.MAX_GROUP = 100;
csid.C.MAX_GROUP_MEMBER = 50;
csid.C.MAX_ANNOUNCE = 1000;
csid.C.MAX_FILE_LINK = 30;

csid.C.MAX_COMPANY_QUERY = 1000;
csid.C.MAX_DEVICE_QUERY = 100;
csid.C.MAX_USER_QUERY = 100;
csid.C.MAX_EVTLOG_QUERY = 1000;
csid.C.MAX_DEVLOG_QUERY = 1000;
csid.C.MAX_ALARM_QUERY = 1000;
csid.C.MAX_AUDIT_QUERY = 1000;
csid.C.MAX_IOSTLOG_QUERY = 1000;
csid.C.MAX_ANNOUNCE_QUERY = 1000;
csid.C.MAX_GROUP_QUERY = 100;
csid.C.MAX_CHART_QUERY = 1000;
csid.C.MAX_SLVDEV_QUERY = 100;

// F/W version
csid.C.KT_6351X_VER = 31;
csid.C.KT_6351X_URL = 'https://bitbucket.org/cloud_enabler/download/downloads/v100b0031.bin';
csid.C.KT_STM32_URL = 'https://bitbucket.org/cloud_enabler/download/downloads/STM100b0014.bin';

// Lilu SuperAdmin 
csid.C.LILU_SACFG  = '{"5315195239183199":{"dbsIdx":1,"name":"cmp0"},"67484875095233":{"dbsIdx":0,"name":"cmp00"}}';
csid.C.LILU_UNREAD = 0;

// status
csid.S = {};
csid.S.SOC_NAME = prj.SOC_NAME;
csid.S.MODEL_NAME = prj.MODEL_NAME;
csid.S.HW_VER = prj.HW_VER;
csid.S.FW_VER = prj.FW_VER;
csid.S.FW_KEY = prj.FW_KEY;
csid.S.FW_BUILD_TIME = "2016-12-01-11:29:02";
csid.S.SERV_UPGRADING = 0;

csid.S.NETWORK_TYPE_ALTERED = 0;
csid.S.CUR_MACADDR = '';
csid.S.CUR_IFACE = '';
csid.S.CUR_IP = '';
csid.S.CUR_MASK = '';
csid.S.CUR_GATEWAY = '';
csid.S.CUR_DNS1 = '';
csid.S.CUR_DNS2 = '';

csid.S.SYS_TIME_ALTERED = 0;
csid.S.SYS_TIME = '';

// export csid
module.exports = csid;
