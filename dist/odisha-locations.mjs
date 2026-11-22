// Public Bhulekh location selectors. Bhulekh retrieves the revenue circle from the village.
export const odishaLocations = [
  ['3','Cuttack','11','Mahanga','8','Kurujanga','102','Bharatapada'],
  ['3','Cuttack','11','Mahanga','8','Kurujanga','101','Bantala'],
  ['3','Cuttack','11','Mahanga','8','Kurujanga','106','Kusunpur'],
  ['3','Cuttack','11','Mahanga','8','Kurujanga','111','Sabalakana'],
  ['3','Cuttack','11','Mahanga','8','Kurujanga','105','Kurujanga'],
  ['19','Kendrapara','8','Derabish','17','Chandol','164','Chandol'],
  ['19','Kendrapara','8','Derabish','17','Chandol','15','Bhanagaan'],
  ['3','Cuttack','15','Nischintakoili','1','Bishnupur','13','Parasailo']
].map(([districtCode,district,tehsilCode,tehsil,riCode,ri,villageCode,village]) => ({
  id:`${districtCode}-${tehsilCode}-${villageCode}`,districtCode,district,tehsilCode,tehsil,riCode,ri,villageCode,village
}));
