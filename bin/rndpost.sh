#!/bin/sh

#host="http://192.168.191.254/ioreg"
host="http://192.168.191.254/ioreg"
sn="28:65:6b:ff:ff:01"
mo="63514"
start_reg=40001
end_reg=40128
pt=3

while [ true ]
do
  body="sn=$sn&mo=$mo"
  for((i=start_reg;i<=end_reg;i=i+1))
  do
    val1=$(echo "obase=16;$(($RANDOM%16))"|bc)
    val2=$(echo "obase=16;$(($RANDOM%16))"|bc)
    body="$body&$i=$val1$val2"
  done
  #echo $body
  /usr/bin/time -f "%e ms" curl -XPOST -d $body $host

  sleep $pt
done
