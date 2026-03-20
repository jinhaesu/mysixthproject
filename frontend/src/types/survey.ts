export interface SurveyWorkplace {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyRequest {
  id: number;
  token: string;
  phone: string;
  workplace_id: number;
  date: string;
  status: 'sent' | 'clock_in' | 'completed' | 'expired';
  message_type: 'sms' | 'kakao';
  message_id: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyResponse {
  id: number;
  request_id: number;
  clock_in_time: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_gps_valid: number;
  clock_out_time: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_gps_valid: number;
  worker_name_ko: string;
  worker_name_en: string;
  bank_name: string;
  bank_account: string;
  id_number: string;
  emergency_contact: string;
  memo: string;
  created_at: string;
  updated_at: string;
}

export interface SurveyResponseWithDetails extends SurveyResponse {
  phone: string;
  date: string;
  status: string;
  workplace_name: string;
  workplace_address: string;
  token: string;
}

export interface SurveyPublicData {
  status: string;
  date: string;
  department: string;
  workplace: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
  } | null;
  response: {
    clock_in_time: string | null;
    clock_out_time: string | null;
    worker_name_ko: string;
    worker_name_en: string;
  } | null;
}
