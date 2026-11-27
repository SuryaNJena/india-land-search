export const stateSources = {
  Chhattisgarh:{
    records:'https://bhuiyan.cg.nic.in/', recordLabel:'Bhuiyan · B-I and P-II',
    map:'https://bhunaksha.cg.nic.in/bhunaksha/', mapState:'22',
    levels:['District','Tehsil','Revenue circle','Village'], trailing:true
  },
  Bihar:{
    records:'https://emutation.bihar.gov.in/biharBhumireport/ViewJamabandi.aspx', recordLabel:'BiharBhumi · Jamabandi',
    map:'https://bhunaksha.bihar.gov.in/10/indexmain.jsp', mapState:'10',
    levels:['District','Subdivision','Circle','Mauza','Survey type','Map instance','Sheet']
  },
  Jharkhand:{
    records:'https://jharbhoomi.jharkhand.gov.in/MISRegister2/DistrictMap.aspx', recordLabel:'Jharbhoomi · Register-II',
    map:'https://jharbhunaksha.jharkhand.gov.in/',
    reason:'Open the official map and complete any verification on Jharbhoomi.'
  },
  Rajasthan:{
    records:'https://apnakhata.rajasthan.gov.in/', recordLabel:'Apna Khata · Jamabandi',
    map:'https://bhunaksha.rajasthan.gov.in/Viewmap/',
    reason:'Open the official portals to view maps and Jamabandi.'
  },
  'Uttar Pradesh':{
    records:'https://upbhulekh.gov.in/', recordLabel:'UP Bhulekh · Khatauni',
    map:'https://upbhunaksha.gov.in/', mapState:'09', plotOnly:true,
    levels:['District','Tehsil','Village'],
    reason:'Use UP BhuNaksha for parcels and UP Bhulekh for the Khatauni.'
  }
};

export const stateSourcePath='/api/state-maps';
