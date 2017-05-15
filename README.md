# cloudenabler-cloud-service
Server code for CloudEnabler project

## Server Architecture (Production)
```
API Requests              <->  Node.js 01    <-> Cluster 01  <-> MariaDB 01 + MariaDB 02 + MariaDB 03
 ------>        HAProxy   <->                <-> Cluster 02  <-> MariaDB 04 + MariaDB 05 + MariaDB 06
                          <->  Node.js 02    <-> Cluster 03  <-> MariaDB 07 + MariaDB 08 + MariaDB 09
                                .....             ....           ...
                          <->  Node.js 0x    <-> Cluster 0x  <-> ...
                          <->  Node.js 0x    <-> Cluster 0x  <-> ...
```

## Prerequisite 
 - Linux with Node.js 6.x (We only tested on Ubuntu)
 - [MariaDB](https://mariadb.org/)
 - [LeanCloud](https://leancloud.cn/) account, bacause we use LeanPush to send notifications.
 - SMTP account, bacause we need to send email notifications.
 - [Galera Cluster](https://mariadb.org/installing-mariadb-galera-cluster-on-debian-ubuntu/) (Optional)
 - [HAproxy](www.haproxy.org) (Optional)
 - SSL Certificates if you want to use HTTPs
 
## Install
 - `git clone` this project
 - Replace `ssl/server.key` and `ssl/server.crt` with your own certificates. 
 - Modify `project.js` for SMPT configurations
 ```
 // SMTP
 prj.SMTP_HOST   = 'smtp.gmail.com';
 prj.SMTP_PORT   = 465; 
 prj.SMTP_USER   = 'xxx';
 prj.SMTP_PSWD   = 'xxxx';
 
 // Backup SMTP
 prj.SMTP_HOST_2 = 'ksmt.com.tw';
 prj.SMTP_PORT_2 = 25;
 prj.SMTP_USER_2 = 'smart.ixo@ksmt.com.tw';
 prj.SMTP_PSWD_2 = 'smartio168';
 ```
 - Modify `project.js` for LeanPush configurations
 ```
 prj.LC_APP_ID  = 'xxxxxxxxxxx';
 prj.LC_APP_KEY = 'xxxxxxxxxxx';

 prj.LCUS_APP_ID  = 'xxxxxxxxxxx';
 prj.LCUS_APP_KEY = 'xxxxxxxxxxx';
 ```

 - Modify `project.js` for Database configurations
 ```
 prj.DB_USER         = 'xxxxxxxxxxx';
 prj.DB_PSWD         = 'xxxxxxxxxxx';
 prj.DB_PORT         = 3306;
 prj.DB_SOCK         = '/var/run/mysqld/mysqld.sock';
 
 ```    
 
 ## Usage
 ```
 user@server:$ ./kcloud 
 ./kcloud Usage:
 ./kcloud debug   : debug project
 ./kcloud start   : start project
 ./kcloud stop    : stop project
 ```
 
 
 
