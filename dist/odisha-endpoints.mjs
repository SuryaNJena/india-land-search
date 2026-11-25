// District assignments from the official BhuNaksha Odisha district picker.
const mapServers = [
  ['app4',443,['7','8','18']], ['app4',8443,['3','17','29']],
  ['app3',443,['20','23','26']], ['app3',8443,['5','24','28']],
  ['app2',443,['11','22','27']], ['app2',8443,['12','15','30']],
  ['app1',443,['1','10','16']], ['app1',8443,['2','9','25']],
  ['',8443,['4','14','19']]
];

export function officialMapBase(districtCode) {
  const [server,port]=mapServers.find(([, ,districts])=>districts.includes(districtCode)) ?? ['',443];
  return `https://${server}bhunakshaodisha.nic.in${port===443?'':`:${port}`}/bhunaksha/`;
}

export function officialRoR(location,khata,type) {
  if (!/^\d{1,12}(?:\/\d{1,12}){0,4}$/.test(khata) || !['front','back'].includes(type)) return '';
  const url=new URL('/ViewRoR.aspx','https://bhulekh.ori.nic.in');
  url.search=new URLSearchParams({DistCode:location.districtCode,TehCode:location.tehsilCode,VillCode:location.villageCode,KhataNo:khata,type});
  return url.href;
}
