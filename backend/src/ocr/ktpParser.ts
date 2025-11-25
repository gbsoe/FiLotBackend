export interface KTPData {
  nik?: string;
  name?: string;
  birthPlace?: string;
  birthDate?: string;
  address?: string;
  gender?: string;
  religion?: string;
  maritalStatus?: string;
}

export function parseKTP(ocrText: string): KTPData {
  const result: KTPData = {};

  const nikMatch = ocrText.match(/NIK[\s:]*([0-9]{16})/i);
  if (nikMatch) {
    result.nik = nikMatch[1];
  }

  const nameMatch = ocrText.match(/Nama[\s:]*([A-Z\s]+)/i);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  const birthMatch = ocrText.match(/Tempat[\/\s]*Tgl\s*Lahir[\s:]*([A-Z\s]+),\s*([0-9\-\/]+)/i);
  if (birthMatch) {
    result.birthPlace = birthMatch[1].trim();
    result.birthDate = birthMatch[2].trim();
  }

  const addressMatch = ocrText.match(/Alamat[\s:]*([A-Za-z0-9\s,\.\/]+)/i);
  if (addressMatch) {
    result.address = addressMatch[1].trim();
  }

  const genderMatch = ocrText.match(/Jenis\s*Kelamin[\s:]*([A-Z\s]+)/i);
  if (genderMatch) {
    result.gender = genderMatch[1].trim();
  }

  const religionMatch = ocrText.match(/Agama[\s:]*([A-Z\s]+)/i);
  if (religionMatch) {
    result.religion = religionMatch[1].trim();
  }

  const maritalMatch = ocrText.match(/Status\s*Perkawinan[\s:]*([A-Z\s]+)/i);
  if (maritalMatch) {
    result.maritalStatus = maritalMatch[1].trim();
  }

  return result;
}
