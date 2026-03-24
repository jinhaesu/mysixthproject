"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  LogIn,
  LogOut,
  Navigation,
  ShieldAlert,
  XCircle,
  Car,
  Shield,
  Megaphone,
  Users,
  Building2,
  ChevronDown,
  ChevronUp,
  Ban,
  Calendar,
} from "lucide-react";

// ─── Translations (정규직 version) ──────────────────────────────
const LANGS = ["ko", "en", "zh", "vi"] as const;
type Lang = (typeof LANGS)[number];

const tr: Record<Lang, Record<string, string>> = {
  ko: {
    langKo: "한국어",
    langEn: "English",
    langZh: "中文",
    langVi: "Tiếng Việt",
    pageTitle: "조인앤조인 출퇴근 기록",
    regular: "정규직",
    loading: "정보를 불러오는 중...",
    error: "오류",
    deactivated: "접근 권한이 없습니다",
    deactivatedDesc: "퇴사 처리된 계정입니다. 관리자에게 문의해주세요.",
    invalidLink: "유효하지 않은 링크입니다.",
    // GPS
    gpsAcquiring: "GPS 위치를 확인하는 중...",
    gpsAllowPermission: "위치 권한을 허용해주세요",
    gpsDenied: "GPS 권한이 거부되었습니다",
    gpsUnavailable: "GPS를 사용할 수 없습니다",
    gpsRequiredNotice:
      "출퇴근 기록을 위해 브라우저 설정에서 위치 권한을 허용해주세요.",
    gpsCannotRecord: "GPS 없이는 출퇴근을 기록할 수 없습니다.",
    withinRange: "근무지 범위 내에 있습니다. 출퇴근 기록이 가능합니다.",
    outOfRange: "근무지 범위를 벗어났습니다",
    distance: "거리",
    allowed: "허용",
    moveCloser: "근처로 이동한 후 다시 시도해주세요.",
    noWorkplace: "근무지가 지정되지 않았습니다",
    contactAdmin: "관리자에게 문의해주세요.",
    // Parking
    parkingNotice:
      "차량으로 방문 시, 공장 내 주차가 불가합니다. 인근 공영주차장을 이용해 주세요.",
    // Safety agreement
    safetyAgreementTitle: "안전 서약 및 동의",
    safetyRule1Title: "■ 안전 수칙",
    safetyRule1:
      "• 작업 전 안전교육 내용을 숙지하고 준수합니다.\n• 지정된 안전장비를 반드시 착용합니다.\n• 위험 상황 발견 시 즉시 관리자에게 보고합니다.",
    safetyRule2Title: "■ 복장 규정",
    safetyRule2:
      "• 위생복, 위생모, 마스크, 안전화를 착용합니다.\n• 개인 장신구(반지, 시계, 목걸이 등)는 작업장 반입 금지입니다.",
    safetyRule3Title: "■ 위생 관리",
    safetyRule3:
      "• 작업 전후 반드시 손 세척 및 소독을 실시합니다.\n• 작업장 내 음식물 반입 및 취식을 금지합니다.",
    safetyRule4Title: "■ 회사 규정 준수",
    safetyRule4:
      "• 현장 관리자의 지시를 반드시 이행합니다.\n• 지시 불이행 시 징계 조치될 수 있습니다.\n• 무단결근 및 지각 시 인사 규정에 따라 처리됩니다.",
    safetyRule5Title: "■ 보안 및 기밀 유지",
    safetyRule5:
      "• 작업장 내 사진/영상 촬영을 엄격히 금지합니다.\n• 업무상 알게 된 정보를 외부에 유출하지 않습니다.\n• 위반 시 사내 규정 및 관련 법령에 따라 처리됩니다.",
    agreementCheckbox: "위 내용을 모두 확인하고 동의합니다.",
    agreementRequired: "안전 서약에 동의해야 출근 기록이 가능합니다.",
    // Video
    videoTitle: "조인앤조인 공장 진입 안내 영상",
    videoDesc: "출근 기록 전 반드시 시청해 주세요.",
    // Notices
    noticesTitle: "생산 안내 및 주요 금일 지시사항",
    // Org chart
    orgChartTitle: "조직 구성",
    leader: "팀장",
    // Clock-in
    clockInWarning: "정확하게 출근 처리하지 않으면 급여에 반영되지 않습니다.",
    clockInButton: "출근 기록하기",
    // Clock-in success
    clockInComplete: "출근 완료",
    name: "이름",
    department: "부서",
    team: "팀",
    clockInTime: "출근 시간",
    // Clock-out
    clockOutTitle: "퇴근 기록",
    clockOutDesc:
      "퇴근 시 아래 버튼을 눌러주세요. 현재 위치가 자동으로 기록됩니다.",
    clockOutButton: "퇴근 기록하기",
    clockOutConfirm: "확실하게 퇴근 하셨습니까?",
    clockOutWarning: "퇴근 처리를 정확히 하지 않으면 급여에 반영되지 않습니다.",
    // Completed
    completedTitle: "출퇴근 기록 완료",
    clockIn: "출근",
    clockOut: "퇴근",
    totalWorkHours: "총 근무시간",
    hours: "시간",
    thankYou: "감사합니다. 이 페이지를 닫으셔도 됩니다.",
    enterPhone: "전화번호를 입력해주세요.",
    enterOtp: "인증번호를 입력해주세요.",
    phoneVerification: "전화번호 인증",
    phoneVerificationDesc: "본인 확인을 위해 등록된 전화번호를 입력해주세요.",
    requestOtp: "인증번호 요청",
    otpSent: "인증번호가 발송되었습니다. 5분 내에 입력해주세요.",
    otpPlaceholder: "6자리 인증번호",
    verifyOtp: "인증 확인",
    phoneVerified: "전화번호 인증 완료",
    resendOtp: "재발송",
    vacation: "휴가 신청",
    vacationDesc: "GPS 위치와 관계없이 휴가를 신청할 수 있습니다.",
    vacationStart: "시작일",
    vacationEnd: "종료일",
    vacationDays: "일수",
    vacationReason: "사유",
    vacationReasonPlaceholder: "휴가 사유를 입력해주세요",
    vacationSubmit: "휴가 신청하기",
    vacationSuccess: "휴가 신청이 완료되었습니다. 관리자 승인을 기다려주세요.",
    vacationBalance: "보유 휴가",
    vacationUsed: "사용",
    vacationRemaining: "잔여",
    vacationDaysUnit: "일",
    vacationPending: "대기중",
    vacationApproved: "승인",
    vacationRejected: "반려",
    vacationHistory: "휴가 신청 내역",
    vacationNone: "신청 내역이 없습니다.",
  },
  en: {
    langKo: "한국어",
    langEn: "English",
    langZh: "中文",
    langVi: "Tiếng Việt",
    pageTitle: "Join&Join Attendance Record",
    regular: "Regular Employee",
    loading: "Loading information...",
    error: "Error",
    deactivated: "Access Denied",
    deactivatedDesc:
      "This account has been deactivated. Please contact administrator.",
    invalidLink: "Invalid link.",
    gpsAcquiring: "Checking GPS location...",
    gpsAllowPermission: "Please allow location access",
    gpsDenied: "GPS permission denied",
    gpsUnavailable: "GPS is unavailable",
    gpsRequiredNotice:
      "Please allow location access in browser settings for attendance recording.",
    gpsCannotRecord: "Cannot record attendance without GPS.",
    withinRange:
      "You are within the workplace range. Attendance recording is available.",
    outOfRange: "You are out of workplace range",
    distance: "distance",
    allowed: "allowed",
    moveCloser: "Please move closer and try again.",
    noWorkplace: "No workplace assigned",
    contactAdmin: "Please contact administrator.",
    parkingNotice:
      "Parking inside the factory is not available. Please use nearby public parking.",
    safetyAgreementTitle: "Safety Agreement & Consent",
    safetyRule1Title: "■ Safety Rules",
    safetyRule1:
      "• Understand and follow safety training before work.\n• Always wear designated safety equipment.\n• Report dangerous situations to supervisor immediately.",
    safetyRule2Title: "■ Dress Code",
    safetyRule2:
      "• Wear hygiene uniform, cap, mask, and safety shoes.\n• Personal accessories (rings, watches, necklaces) are prohibited.",
    safetyRule3Title: "■ Hygiene Management",
    safetyRule3:
      "• Wash and sanitize hands before and after work.\n• Food and beverages are prohibited in the work area.",
    safetyRule4Title: "■ Company Policy Compliance",
    safetyRule4:
      "• Follow all instructions from on-site supervisors.\n• Non-compliance may result in disciplinary action.\n• Unexcused absences and tardiness will be handled per HR policy.",
    safetyRule5Title: "■ Security & Confidentiality",
    safetyRule5:
      "• Photography/video recording in the workplace is strictly prohibited.\n• Do not disclose any work-related information externally.\n• Violations will be handled per company policy and applicable laws.",
    agreementCheckbox: "I have read and agree to all the above terms.",
    agreementRequired: "You must agree to the safety terms to clock in.",
    videoTitle: "Factory Entry Guide Video",
    videoDesc: "Please watch before clocking in.",
    noticesTitle: "Daily Production Notices & Key Instructions",
    orgChartTitle: "Organization Chart",
    leader: "Leader",
    clockInWarning: "Payment will not reflect if clock-in is not recorded properly.",
    clockInButton: "Record Clock In",
    clockInComplete: "Clock In Complete",
    name: "Name",
    department: "Department",
    team: "Team",
    clockInTime: "Clock In Time",
    clockOutTitle: "Clock Out",
    clockOutDesc:
      "Press the button below to clock out. Your location will be recorded.",
    clockOutButton: "Record Clock Out",
    clockOutConfirm: "Are you sure you have finished work?",
    clockOutWarning:
      "Payment will not reflect if clock-out is not recorded properly.",
    completedTitle: "Attendance Record Complete",
    clockIn: "Clock In",
    clockOut: "Clock Out",
    totalWorkHours: "Total Work Hours",
    hours: "hours",
    thankYou: "Thank you. You may close this page.",
    enterPhone: "Please enter your phone number.",
    enterOtp: "Please enter the verification code.",
    phoneVerification: "Phone Verification",
    phoneVerificationDesc: "Enter your registered phone number for identity verification.",
    requestOtp: "Request Code",
    otpSent: "Verification code sent. Enter within 5 minutes.",
    otpPlaceholder: "6-digit code",
    verifyOtp: "Verify",
    phoneVerified: "Phone verified",
    resendOtp: "Resend",
    vacation: "Leave Request",
    vacationDesc: "Request leave regardless of GPS location.",
    vacationStart: "Start Date",
    vacationEnd: "End Date",
    vacationDays: "Days",
    vacationReason: "Reason",
    vacationReasonPlaceholder: "Enter reason for leave",
    vacationSubmit: "Submit Request",
    vacationSuccess: "Leave request submitted. Waiting for approval.",
    vacationBalance: "Leave Balance",
    vacationUsed: "Used",
    vacationRemaining: "Remaining",
    vacationDaysUnit: "days",
    vacationPending: "Pending",
    vacationApproved: "Approved",
    vacationRejected: "Rejected",
    vacationHistory: "Leave History",
    vacationNone: "No requests found.",
  },
  zh: {
    langKo: "한국어",
    langEn: "English",
    langZh: "中文",
    langVi: "Tiếng Việt",
    pageTitle: "Join&Join 考勤记录",
    regular: "正式员工",
    loading: "加载中...",
    error: "错误",
    deactivated: "访问被拒绝",
    deactivatedDesc: "该账户已被停用。请联系管理员。",
    invalidLink: "无效链接。",
    gpsAcquiring: "正在获取GPS位置...",
    gpsAllowPermission: "请允许位置访问",
    gpsDenied: "GPS权限被拒绝",
    gpsUnavailable: "GPS不可用",
    gpsRequiredNotice: "请在浏览器设置中允许位置权限以记录考勤。",
    gpsCannotRecord: "没有GPS无法记录考勤。",
    withinRange: "您在工作范围内。可以记录考勤。",
    outOfRange: "您不在工作范围内",
    distance: "距离",
    allowed: "允许",
    moveCloser: "请靠近后重试。",
    noWorkplace: "未指定工作地点",
    contactAdmin: "请联系管理员。",
    parkingNotice: "工厂内不提供停车。请使用附近的公共停车场。",
    safetyAgreementTitle: "安全协议与同意",
    safetyRule1Title: "■ 安全规则",
    safetyRule1:
      "• 工作前了解并遵守安全培训内容。\n• 必须佩戴指定的安全装备。\n• 发现危险情况立即向管理人员报告。",
    safetyRule2Title: "■ 着装规定",
    safetyRule2:
      "• 穿戴卫生服、帽子、口罩和安全鞋。\n• 禁止佩戴个人饰品（戒指、手表、项链等）。",
    safetyRule3Title: "■ 卫生管理",
    safetyRule3:
      "• 工作前后必须洗手消毒。\n• 禁止在工作区域携带和食用食品。",
    safetyRule4Title: "■ 遵守公司规定",
    safetyRule4:
      "• 必须服从现场管理人员的指示。\n• 不服从指示可能导致纪律处分。\n• 无故缺勤和迟到将按人事规定处理。",
    safetyRule5Title: "■ 安全与保密",
    safetyRule5:
      "• 严禁在工作场所拍照/录像。\n• 不得向外部泄露工作相关信息。\n• 违反者将按公司规定及相关法律处理。",
    agreementCheckbox: "我已阅读并同意以上所有条款。",
    agreementRequired: "必须同意安全条款才能打卡。",
    videoTitle: "工厂入场指南视频",
    videoDesc: "请在打卡前观看。",
    noticesTitle: "生产通知及重要日常指示",
    orgChartTitle: "组织架构",
    leader: "组长",
    clockInWarning: "如未准确记录上班，将不反映在工资中。",
    clockInButton: "记录上班",
    clockInComplete: "上班打卡完成",
    name: "姓名",
    department: "部门",
    team: "团队",
    clockInTime: "上班时间",
    clockOutTitle: "下班打卡",
    clockOutDesc: "请按下方按钮下班打卡。您的位置将被自动记录。",
    clockOutButton: "记录下班",
    clockOutConfirm: "确定已经下班了吗？",
    clockOutWarning: "如未正确记录下班，将不反映在工资中。",
    completedTitle: "考勤记录完成",
    clockIn: "上班",
    clockOut: "下班",
    totalWorkHours: "总工作时间",
    hours: "小时",
    thankYou: "谢谢。您可以关闭此页面。",
    enterPhone: "请输入手机号码。",
    enterOtp: "请输入验证码。",
    phoneVerification: "手机验证",
    phoneVerificationDesc: "请输入注册的手机号码进行身份验证。",
    requestOtp: "发送验证码",
    otpSent: "验证码已发送。请在5分钟内输入。",
    otpPlaceholder: "6位验证码",
    verifyOtp: "验证",
    phoneVerified: "手机验证完成",
    resendOtp: "重新发送",
    vacation: "请假申请",
    vacationDesc: "可以不受GPS位置限制申请休假。",
    vacationStart: "开始日期",
    vacationEnd: "结束日期",
    vacationDays: "天数",
    vacationReason: "事由",
    vacationReasonPlaceholder: "请输入请假事由",
    vacationSubmit: "提交申请",
    vacationSuccess: "请假申请已提交，等待管理员审批。",
    vacationBalance: "年假余额",
    vacationUsed: "已用",
    vacationRemaining: "剩余",
    vacationDaysUnit: "天",
    vacationPending: "待审批",
    vacationApproved: "已批准",
    vacationRejected: "已拒绝",
    vacationHistory: "请假记录",
    vacationNone: "暂无记录。",
  },
  vi: {
    langKo: "한국어",
    langEn: "English",
    langZh: "中文",
    langVi: "Tiếng Việt",
    pageTitle: "Join&Join Chấm công",
    regular: "Nhân viên chính thức",
    loading: "Đang tải...",
    error: "Lỗi",
    deactivated: "Truy cập bị từ chối",
    deactivatedDesc:
      "Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.",
    invalidLink: "Liên kết không hợp lệ.",
    gpsAcquiring: "Đang kiểm tra vị trí GPS...",
    gpsAllowPermission: "Vui lòng cho phép truy cập vị trí",
    gpsDenied: "Quyền GPS bị từ chối",
    gpsUnavailable: "GPS không khả dụng",
    gpsRequiredNotice:
      "Vui lòng cho phép quyền vị trí trong cài đặt trình duyệt để chấm công.",
    gpsCannotRecord: "Không thể chấm công mà không có GPS.",
    withinRange: "Bạn đang trong phạm vi nơi làm việc. Có thể chấm công.",
    outOfRange: "Bạn đang ngoài phạm vi nơi làm việc",
    distance: "khoảng cách",
    allowed: "cho phép",
    moveCloser: "Vui lòng di chuyển đến gần hơn và thử lại.",
    noWorkplace: "Chưa chỉ định nơi làm việc",
    contactAdmin: "Vui lòng liên hệ quản trị viên.",
    parkingNotice:
      "Không có chỗ đậu xe trong nhà máy. Vui lòng sử dụng bãi đậu xe công cộng gần đó.",
    safetyAgreementTitle: "Cam kết An toàn & Đồng ý",
    safetyRule1Title: "■ Quy tắc an toàn",
    safetyRule1:
      "• Nắm vững và tuân thủ nội dung đào tạo an toàn.\n• Luôn đeo thiết bị an toàn được chỉ định.\n• Báo cáo ngay tình huống nguy hiểm cho người quản lý.",
    safetyRule2Title: "■ Quy định trang phục",
    safetyRule2:
      "• Mặc đồng phục vệ sinh, mũ, khẩu trang, giày bảo hộ.\n• Cấm đeo phụ kiện cá nhân (nhẫn, đồng hồ, dây chuyền).",
    safetyRule3Title: "■ Quản lý vệ sinh",
    safetyRule3:
      "• Rửa tay và khử trùng trước và sau khi làm việc.\n• Cấm mang thức ăn và đồ uống vào khu vực làm việc.",
    safetyRule4Title: "■ Tuân thủ quy định công ty",
    safetyRule4:
      "• Phải tuân thủ mọi chỉ đạo từ người quản lý hiện trường.\n• Không tuân thủ có thể dẫn đến kỷ luật.\n• Vắng mặt và đi trễ không phép sẽ được xử lý theo quy định nhân sự.",
    safetyRule5Title: "■ Bảo mật & Giữ bí mật",
    safetyRule5:
      "• Nghiêm cấm chụp ảnh/quay phim tại nơi làm việc.\n• Không tiết lộ thông tin công việc ra bên ngoài.\n• Vi phạm sẽ được xử lý theo quy định công ty và pháp luật.",
    agreementCheckbox: "Tôi đã đọc và đồng ý tất cả các điều khoản trên.",
    agreementRequired: "Bạn phải đồng ý với các điều khoản an toàn để chấm công.",
    videoTitle: "Video hướng dẫn vào nhà máy",
    videoDesc: "Vui lòng xem trước khi chấm công.",
    noticesTitle: "Thông báo sản xuất & Chỉ thị quan trọng hôm nay",
    orgChartTitle: "Sơ đồ tổ chức",
    leader: "Trưởng nhóm",
    clockInWarning:
      "Nếu không chấm công vào chính xác, lương sẽ không được phản ánh.",
    clockInButton: "Ghi nhận vào ca",
    clockInComplete: "Chấm công vào hoàn tất",
    name: "Tên",
    department: "Phòng ban",
    team: "Nhóm",
    clockInTime: "Giờ vào",
    clockOutTitle: "Chấm công ra",
    clockOutDesc:
      "Nhấn nút bên dưới để chấm công ra. Vị trí của bạn sẽ được ghi lại.",
    clockOutButton: "Ghi nhận ra ca",
    clockOutConfirm: "Bạn chắc chắn đã kết thúc công việc chưa?",
    clockOutWarning:
      "Nếu không chấm công ra chính xác, lương sẽ không được phản ánh.",
    completedTitle: "Hoàn tất chấm công",
    clockIn: "Vào ca",
    clockOut: "Ra ca",
    totalWorkHours: "Tổng giờ làm việc",
    hours: "giờ",
    thankYou: "Cảm ơn bạn. Bạn có thể đóng trang này.",
    enterPhone: "Vui lòng nhập số điện thoại.",
    enterOtp: "Vui lòng nhập mã xác minh.",
    phoneVerification: "Xác minh số điện thoại",
    phoneVerificationDesc: "Nhập số điện thoại đã đăng ký để xác minh danh tính.",
    requestOtp: "Yêu cầu mã",
    otpSent: "Mã xác minh đã gửi. Nhập trong vòng 5 phút.",
    otpPlaceholder: "Mã 6 chữ số",
    verifyOtp: "Xác minh",
    phoneVerified: "Đã xác minh",
    resendOtp: "Gửi lại",
    vacation: "Đơn xin nghỉ",
    vacationDesc: "Xin nghỉ không cần vị trí GPS.",
    vacationStart: "Ngày bắt đầu",
    vacationEnd: "Ngày kết thúc",
    vacationDays: "Số ngày",
    vacationReason: "Lý do",
    vacationReasonPlaceholder: "Nhập lý do xin nghỉ",
    vacationSubmit: "Gửi đơn",
    vacationSuccess: "Đã gửi đơn. Chờ phê duyệt.",
    vacationBalance: "Ngày phép",
    vacationUsed: "Đã dùng",
    vacationRemaining: "Còn lại",
    vacationDaysUnit: "ngày",
    vacationPending: "Chờ duyệt",
    vacationApproved: "Đã duyệt",
    vacationRejected: "Từ chối",
    vacationHistory: "Lịch sử nghỉ phép",
    vacationNone: "Chưa có đơn nào.",
  },
};

function t(lang: string, key: string): string {
  return (
    (tr as Record<string, Record<string, string>>)[lang]?.[key] ||
    tr.ko[key] ||
    key
  );
}

// ─── Types ──────────────────────────────────────────────────────
interface Notice {
  id: string;
  title: string;
  content: string;
}

interface OrgDepartment {
  department: string;
  teams: {
    team: string;
    leader: string | null;
    members?: string[];
  }[];
}

interface Workplace {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface Attendance {
  clock_in_time: string | null;
  clock_out_time: string | null;
}

interface RegularPublicData {
  employee: { name: string; department: string; team: string; role: string };
  employee_name?: string;
  department?: string | null;
  team?: string | null;
  role?: string | null;
  status: "ready" | "clocked_in" | "completed" | "deactivated";
  date: string;
  workplace: Workplace | null;
  attendance: Attendance | null;
  notices: Notice[];
  org_chart: OrgDepartment[];
}

// ─── API ────────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ─── Main Content ───────────────────────────────────────────────
function RegularContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<RegularPublicData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Language
  const [lang, setLang] = useState<string>("ko");

  // GPS
  const [gpsStatus, setGpsStatus] = useState<
    "acquiring" | "acquired" | "denied" | "error"
  >("acquiring");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [distance, setDistance] = useState<number | null>(null);

  // Safety agreement (daily)
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // Phone verification
  const [phoneInput, setPhoneInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState("");

  // Vacation
  const [showVacation, setShowVacation] = useState(false);
  const [vacStartDate, setVacStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [vacEndDate, setVacEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [vacDays, setVacDays] = useState("1");
  const [vacReason, setVacReason] = useState("");
  const [vacSubmitting, setVacSubmitting] = useState(false);
  const [vacData, setVacData] = useState<any>(null);

  // Org chart expand
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const toggleDept = (dept: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // ── Load data ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!token) {
      setError(t("ko", "invalidLink"));
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Error ${res.status}`);
      }
      const result = await res.json();
      // Flatten employee fields for easy access
      if (result.employee) {
        result.employee_name = result.employee.name;
        result.department = result.employee.department;
        result.team = result.employee.team;
        result.role = result.employee.role;
      }
      setData(result as RegularPublicData);

      // Auto-expand all departments for org chart
      if (result.org_chart && result.org_chart.length) {
        setExpandedDepts(new Set(result.org_chart.map((d: any) => d.department)));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadVacations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/vacations`);
      if (res.ok) {
        const data = await res.json();
        setVacData(data);
      }
    } catch {}
  }, [token]);

  useEffect(() => { loadVacations(); }, [loadVacations]);

  useEffect(() => {
    if (vacStartDate && vacEndDate) {
      const start = new Date(vacStartDate);
      const end = new Date(vacEndDate);
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) setVacDays(String(diff));
    }
  }, [vacStartDate, vacEndDate]);

  // ── Distance calculation ───────────────────────────────────────
  const calcDistance = useCallback(
    (lat: number, lng: number) => {
      if (!data?.workplace) return;
      const R = 6371000;
      const dLat = ((data.workplace.latitude - lat) * Math.PI) / 180;
      const dLng = ((data.workplace.longitude - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((data.workplace.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      setDistance(Math.round(R * c));
    },
    [data?.workplace]
  );

  // ── GPS watcher ────────────────────────────────────────────────
  useEffect(() => {
    if (
      !data ||
      data.status === "completed" ||
      data.status === "deactivated"
    )
      return;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setGpsStatus("acquired");
        calcDistance(latitude, longitude);
      },
      (err) => {
        console.error("GPS error:", err);
        setGpsStatus(err.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [data, calcDistance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Phone OTP verification ──────────────────────────────────────
  const handleSendOtp = async () => {
    if (!phoneInput.trim()) { setOtpError(t(lang, "enterPhone")); return; }
    setOtpSending(true);
    setOtpError("");
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed");
      setOtpSent(true);
    } catch (err: any) {
      setOtpError(err.message);
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { setOtpError(t(lang, "enterOtp")); return; }
    setOtpVerifying(true);
    setOtpError("");
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed");
      setPhoneVerified(true);
    } catch (err: any) {
      setOtpError(err.message);
    } finally {
      setOtpVerifying(false);
    }
  };

  // ── Vacation submit ────────────────────────────────────────────
  const handleVacationSubmit = async () => {
    if (!vacStartDate || !vacEndDate || !vacDays) return;
    setVacSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/vacation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: vacStartDate, end_date: vacEndDate, days: parseFloat(vacDays), reason: vacReason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed");
      alert(t(lang, "vacationSuccess"));
      setVacReason("");
      loadVacations();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setVacSubmitting(false);
    }
  };

  // ── Clock-in (simple, no personal info form) ──────────────────
  const handleClockIn = async () => {
    if (!agreementAccepted) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/api/regular-public/${token}/clock-in`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: coords?.lat,
            longitude: coords?.lng,
            agreement_accepted: true,
            agreement_accepted_at: new Date().toISOString(),
            phone_verified: true,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Error ${res.status}`);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Clock-out ──────────────────────────────────────────────────
  const handleClockOut = async () => {
    if (!confirm(t(lang, "clockOutConfirm"))) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/api/regular-public/${token}/clock-out`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: coords?.lat,
            longitude: coords?.lng,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Error ${res.status}`);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-3 text-gray-600">{t(lang, "loading")}</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            {t(lang, "error")}
          </h2>
          <p className="mt-2 text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ── Deactivated employee ───────────────────────────────────────
  if (data.status === "deactivated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-sm w-full text-center">
          <Ban className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            {t(lang, "deactivated")}
          </h2>
          <p className="mt-2 text-gray-600">{t(lang, "deactivatedDesc")}</p>
        </div>
      </div>
    );
  }

  // ── Derived state ──────────────────────────────────────────────
  const hasWorkplace = !!data.workplace;
  const isWithinRadius =
    hasWorkplace &&
    distance !== null &&
    distance <= data.workplace!.radius_meters;
  const isOutOfRange =
    hasWorkplace && gpsStatus === "acquired" && !isWithinRadius;
  const gpsReady = gpsStatus === "acquired";
  const canAct = hasWorkplace && gpsReady && isWithinRadius;
  const showForm = data.status === "ready" || data.status === "clocked_in";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-5">
        <h1 className="text-lg font-bold">{t(lang, "pageTitle")}</h1>
        <p className="text-indigo-200 text-sm mt-0.5">{data.date} {t(lang, "workDate")}</p>
        <div className="mt-2 bg-indigo-500/30 rounded-lg px-3 py-2 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold">{data.employee_name}</p>
            {data.role && data.role !== '일반' && (
              <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded text-xs font-bold">{data.role}</span>
            )}
          </div>
          {(data.department || data.team) && (
            <p className="text-indigo-200 text-sm">
              {data.department}
              {data.department && data.team && " · "}
              {data.team}
            </p>
          )}
          {data.workplace && (
            <p className="text-sm font-medium flex items-center gap-1.5 mt-1">
              <MapPin className="w-4 h-4" />
              {data.workplace.name}
            </p>
          )}
          {data.workplace?.address && (
            <p className="text-indigo-200 text-xs">{data.workplace.address}</p>
          )}
        </div>

        {/* Parking Notice */}
        {showForm && (
          <div className="mt-3 bg-amber-500/20 border border-amber-400/40 rounded-lg px-3 py-2 flex items-start gap-2">
            <Car className="w-4 h-4 text-amber-200 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-100">
              {t(lang, "parkingNotice")}
            </p>
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* ── Language Selector ──────────────────────────────────── */}
        <div className="flex justify-center gap-2">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                lang === l
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t(l, `lang${l.charAt(0).toUpperCase() + l.slice(1)}`)}
            </button>
          ))}
        </div>

        {/* ── GPS Status ─────────────────────────────────────────── */}
        {showForm && (
          <>
            {/* GPS acquiring */}
            {gpsStatus === "acquiring" && (
              <div className="rounded-lg p-5 bg-indigo-50 border border-indigo-200 text-center">
                <Navigation className="w-8 h-8 text-indigo-500 animate-pulse mx-auto" />
                <p className="mt-3 text-sm font-medium text-indigo-700">
                  {t(lang, "gpsAcquiring")}
                </p>
                <p className="text-xs text-indigo-500 mt-1">
                  {t(lang, "gpsAllowPermission")}
                </p>
              </div>
            )}

            {/* GPS denied / error */}
            {(gpsStatus === "denied" || gpsStatus === "error") && (
              <div className="rounded-lg p-5 bg-red-50 border border-red-200 text-center">
                <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-red-700">
                  {gpsStatus === "denied"
                    ? t(lang, "gpsDenied")
                    : t(lang, "gpsUnavailable")}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  {t(lang, "gpsRequiredNotice")}
                </p>
                {hasWorkplace && (
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    {t(lang, "gpsCannotRecord")}
                  </p>
                )}
              </div>
            )}

            {/* GPS acquired + within range */}
            {gpsReady && isWithinRadius && (
              <div className="rounded-lg p-4 bg-green-50 border border-green-200 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700">
                    {data.workplace!.name} — {distance}m {t(lang, "distance")}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {t(lang, "withinRange")}
                  </p>
                </div>
              </div>
            )}

            {/* GPS acquired + out of range */}
            {isOutOfRange && (
              <div className="rounded-lg p-5 bg-red-50 border border-red-200 text-center">
                <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-red-700">
                  {t(lang, "outOfRange")}
                </p>
                <p className="text-base font-bold text-red-800 mt-1">
                  {distance}m {t(lang, "distance")} ({t(lang, "allowed")}:{" "}
                  {data.workplace!.radius_meters}m)
                </p>
                <p className="text-xs text-red-500 mt-2">
                  {data.workplace!.name} {t(lang, "moveCloser")}
                </p>
              </div>
            )}

            {/* No workplace assigned */}
            {!hasWorkplace && (
              <div className="rounded-lg p-5 bg-yellow-50 border border-yellow-200 text-center">
                <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-yellow-700">
                  {t(lang, "noWorkplace")}
                </p>
                <p className="text-xs text-yellow-600 mt-1">
                  {t(lang, "contactAdmin")}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Safety Agreement (daily, before clock-in) ───────────── */}
        {data.status === "ready" && !agreementAccepted && (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <Shield className="w-5 h-5" />
              <h2 className="font-semibold">
                {t(lang, "safetyAgreementTitle")}
              </h2>
            </div>

            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4 text-sm text-gray-700">
              <div>
                <p className="font-bold text-gray-900">
                  {t(lang, "safetyRule1Title")}
                </p>
                <p className="whitespace-pre-line mt-1">
                  {t(lang, "safetyRule1")}
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-900">
                  {t(lang, "safetyRule2Title")}
                </p>
                <p className="whitespace-pre-line mt-1">
                  {t(lang, "safetyRule2")}
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-900">
                  {t(lang, "safetyRule3Title")}
                </p>
                <p className="whitespace-pre-line mt-1">
                  {t(lang, "safetyRule3")}
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-900">
                  {t(lang, "safetyRule4Title")}
                </p>
                <p className="whitespace-pre-line mt-1">
                  {t(lang, "safetyRule4")}
                </p>
              </div>
              <div>
                <p className="font-bold text-gray-900">
                  {t(lang, "safetyRule5Title")}
                </p>
                <p className="whitespace-pre-line mt-1">
                  {t(lang, "safetyRule5")}
                </p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-800">
                {t(lang, "agreementCheckbox")}
              </span>
            </label>

            {!agreementAccepted && (
              <p className="text-xs text-red-500 font-medium">
                {t(lang, "agreementRequired")}
              </p>
            )}
          </div>
        )}

        {/* ── Factory Guide Video ─────────────────────────────────── */}
        {data.status === "ready" && agreementAccepted && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-semibold text-gray-900 text-sm">
                {t(lang, "videoTitle")}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t(lang, "videoDesc")}
              </p>
            </div>
            <div className="px-5 pb-4">
              <video
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: "300px" }}
              >
                <source src="/videos/factory-guide.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        )}

        {/* ── Daily Notices ────────────────────────────────────────── */}
        {data.status === "ready" &&
          agreementAccepted &&
          (data.notices?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 text-indigo-700 mb-3">
                <Megaphone className="w-5 h-5" />
                <h2 className="font-semibold text-gray-900 text-sm">
                  {t(lang, "noticesTitle")}
                </h2>
              </div>
              {data.notices.map((notice) => (
                <div
                  key={notice.id}
                  className="border-l-4 border-indigo-500 pl-3 py-2 mb-2"
                >
                  <p className="font-medium text-sm text-gray-900">
                    {notice.title}
                  </p>
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-1 font-sans">
                    {notice.content}
                  </pre>
                </div>
              ))}
            </div>
          )}

        {/* ── Org Chart ────────────────────────────────────────────── */}
        {data.status === "ready" &&
          agreementAccepted &&
          (data.org_chart?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 text-indigo-700 mb-3">
                <Users className="w-5 h-5" />
                <h2 className="font-semibold text-gray-900 text-sm">
                  {t(lang, "orgChartTitle")}
                </h2>
              </div>
              <div className="space-y-2">
                {(data.org_chart || []).map((dept: any) => (
                  <div
                    key={dept.department}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleDept(dept.department)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        <span className="font-semibold text-sm text-indigo-900">
                          {dept.department}
                        </span>
                      </div>
                      {expandedDepts.has(dept.department) ? (
                        <ChevronUp className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-indigo-400" />
                      )}
                    </button>
                    {expandedDepts.has(dept.department) && (
                      <div className="px-4 py-2 space-y-2">
                        {(dept.teams || []).map((team: any) => (
                          <div
                            key={team.team}
                            className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-b-0"
                          >
                            <span className="text-sm font-medium text-gray-800">
                              {team.team}
                            </span>
                            {team.leader && (
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                {team.leader_role || '반장'}: {team.leader}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* ── Clock-in Button (simple - no form fields) ───────────── */}
        {data.status === "ready" && canAct && agreementAccepted && (
          <div className="space-y-4">
            {/* Phone Verification */}
            {!phoneVerified ? (
              <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2 text-indigo-700 mb-2">
                  <Shield className="w-5 h-5" />
                  <h2 className="font-semibold">{t(lang, "phoneVerification")}</h2>
                </div>
                <p className="text-sm text-gray-600">{t(lang, "phoneVerificationDesc")}</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t(lang, "phoneVerification")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="010-0000-0000"
                      disabled={phoneVerified}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
                    />
                    <button
                      onClick={handleSendOtp}
                      disabled={otpSending || !phoneInput.trim()}
                      className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 hover:bg-indigo-700 whitespace-nowrap"
                    >
                      {otpSending ? "..." : otpSent ? t(lang, "resendOtp") : t(lang, "requestOtp")}
                    </button>
                  </div>
                </div>

                {otpSent && (
                  <div className="space-y-2">
                    <p className="text-xs text-green-600 font-medium">{t(lang, "otpSent")}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder={t(lang, "otpPlaceholder")}
                        maxLength={6}
                        inputMode="numeric"
                        className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base text-center tracking-widest font-mono"
                      />
                      <button
                        onClick={handleVerifyOtp}
                        disabled={otpVerifying || otpCode.length !== 6}
                        className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 hover:bg-green-700 whitespace-nowrap"
                      >
                        {otpVerifying ? "..." : t(lang, "verifyOtp")}
                      </button>
                    </div>
                  </div>
                )}

                {otpError && (
                  <p className="text-xs text-red-600 font-medium">{otpError}</p>
                )}
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <p className="text-sm font-medium text-green-700">{t(lang, "phoneVerified")}</p>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 text-indigo-700 mb-2">
                <LogIn className="w-5 h-5" />
                <h2 className="font-semibold">
                  {lang === "ko"
                    ? "출근 기록"
                    : lang === "en"
                    ? "Clock In"
                    : lang === "zh"
                    ? "上班打卡"
                    : "Chấm công vào"}
                </h2>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-700 font-bold">
                  {t(lang, "clockInWarning")}
                </p>
              </div>

              <button
                onClick={handleClockIn}
                disabled={submitting || !agreementAccepted || !phoneVerified}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-semibold text-base disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Clock className="w-5 h-5" />
                    {t(lang, "clockInButton")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Clocked-in: show clock-out ──────────────────────────── */}
        {data.status === "clocked_in" && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="flex items-center gap-2 text-green-700 mb-3">
                <CheckCircle className="w-5 h-5" />
                <h2 className="font-semibold">{t(lang, "clockInComplete")}</h2>
              </div>
              <div className="space-y-1 text-sm text-green-800">
                <p>
                  <span className="font-medium">{t(lang, "name")}:</span>{" "}
                  {data.employee_name}
                </p>
                {data.department && (
                  <p>
                    <span className="font-medium">
                      {t(lang, "department")}:
                    </span>{" "}
                    {data.department}
                  </p>
                )}
                {data.team && (
                  <p>
                    <span className="font-medium">{t(lang, "team")}:</span>{" "}
                    {data.team}
                  </p>
                )}
                <p>
                  <span className="font-medium">
                    {t(lang, "clockInTime")}:
                  </span>{" "}
                  {data.attendance?.clock_in_time
                    ? new Date(
                        data.attendance.clock_in_time
                      ).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </p>
              </div>
            </div>

            {/* Clock-out button */}
            {canAct && (
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center gap-2 text-orange-700 mb-4">
                  <LogOut className="w-5 h-5" />
                  <h2 className="font-semibold">
                    {t(lang, "clockOutTitle")}
                  </h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  {t(lang, "clockOutDesc")}
                </p>
                <button
                  onClick={handleClockOut}
                  disabled={submitting}
                  className="w-full py-3 bg-orange-600 text-white rounded-lg font-semibold text-base disabled:bg-gray-300 hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Clock className="w-5 h-5" />
                      {t(lang, "clockOutButton")}
                    </>
                  )}
                </button>
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700 font-bold text-center">
                    {t(lang, "clockOutWarning")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Completed ───────────────────────────────────────────── */}
        {data.status === "completed" && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-gray-900">
              {t(lang, "completedTitle")}
            </h2>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-medium">{t(lang, "name")}:</span>{" "}
                {data.employee_name}
              </p>
              {data.department && (
                <p>
                  <span className="font-medium">
                    {t(lang, "department")}:
                  </span>{" "}
                  {data.department}
                </p>
              )}
              <p>
                <span className="font-medium">{t(lang, "clockIn")}:</span>{" "}
                {data.attendance?.clock_in_time
                  ? new Date(
                      data.attendance.clock_in_time
                    ).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-"}
              </p>
              <p>
                <span className="font-medium">{t(lang, "clockOut")}:</span>{" "}
                {data.attendance?.clock_out_time
                  ? new Date(
                      data.attendance.clock_out_time
                    ).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-"}
              </p>
              {data.attendance?.clock_in_time &&
                data.attendance?.clock_out_time && (
                  <p className="font-medium text-indigo-700 mt-2">
                    {t(lang, "totalWorkHours")}:{" "}
                    {(
                      (new Date(data.attendance.clock_out_time).getTime() -
                        new Date(data.attendance.clock_in_time).getTime()) /
                      (1000 * 60 * 60)
                    ).toFixed(1)}
                    {t(lang, "hours")}
                  </p>
                )}
            </div>
            <p className="mt-6 text-gray-500 text-sm">
              {t(lang, "thankYou")}
            </p>
          </div>
        )}
        {/* Vacation Request Section - always available */}
        {data && (
          <div className="mt-4">
            <button
              onClick={() => setShowVacation(!showVacation)}
              className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-base hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              {t(lang, "vacation")}
            </button>

            {showVacation && (
              <div className="mt-3 bg-white rounded-xl shadow-sm p-5 space-y-4">
                <p className="text-sm text-gray-600">{t(lang, "vacationDesc")}</p>

                {/* Balance display */}
                {vacData?.balance && (
                  <div className="flex gap-3">
                    <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-blue-700">{vacData.balance.total}</p>
                      <p className="text-xs text-blue-600">{t(lang, "vacationBalance")}</p>
                    </div>
                    <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-amber-700">{vacData.balance.used}</p>
                      <p className="text-xs text-amber-600">{t(lang, "vacationUsed")}</p>
                    </div>
                    <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-lg font-bold text-green-700">{(vacData.balance.total - vacData.balance.used).toFixed(1)}</p>
                      <p className="text-xs text-green-600">{t(lang, "vacationRemaining")}</p>
                    </div>
                  </div>
                )}

                {/* Request form */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, "vacationStart")}</label>
                    <input type="date" value={vacStartDate} onChange={(e) => setVacStartDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, "vacationEnd")}</label>
                    <input type="date" value={vacEndDate} onChange={(e) => setVacEndDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, "vacationDays")}</label>
                  <input type="number" step="0.5" min="0.5" value={vacDays} onChange={(e) => setVacDays(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, "vacationReason")}</label>
                  <textarea value={vacReason} onChange={(e) => setVacReason(e.target.value)}
                    placeholder={t(lang, "vacationReasonPlaceholder")}
                    rows={2} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base resize-none" />
                </div>
                <button onClick={handleVacationSubmit} disabled={vacSubmitting || !vacStartDate || !vacEndDate}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold disabled:bg-gray-300 hover:bg-purple-700 transition-colors">
                  {vacSubmitting ? "..." : t(lang, "vacationSubmit")}
                </button>

                {/* History */}
                {vacData?.requests && vacData.requests.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">{t(lang, "vacationHistory")}</h3>
                    <div className="space-y-2">
                      {vacData.requests.map((r: any) => (
                        <div key={r.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{r.start_date} ~ {r.end_date} ({r.days}{t(lang, "vacationDaysUnit")})</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              r.status === 'approved' ? 'bg-green-100 text-green-700' :
                              r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {r.status === 'approved' ? t(lang, "vacationApproved") :
                               r.status === 'rejected' ? t(lang, "vacationRejected") :
                               t(lang, "vacationPending")}
                            </span>
                          </div>
                          {r.reason && <p className="text-gray-500 text-xs mt-1">{r.reason}</p>}
                          {r.admin_memo && <p className="text-blue-600 text-xs mt-1">관리자: {r.admin_memo}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page Export ─────────────────────────────────────────────────
export default function RegularPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <RegularContent />
    </Suspense>
  );
}
