// 客户状态
export const CUSTOMER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  POTENTIAL: { label: '潜在客户', color: 'bg-blue-100 text-blue-800' },
  ACTIVE: { label: '活跃客户', color: 'bg-green-100 text-green-800' },
  INACTIVE: { label: '不活跃', color: 'bg-gray-100 text-gray-800' },
  BLACKLISTED: { label: '黑名单', color: 'bg-red-100 text-red-800' },
};

// 线索阶段
export const LEAD_STAGE_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: '新线索', color: 'bg-blue-100 text-blue-700' },
  CONTACTED: { label: '联系中', color: 'bg-indigo-100 text-indigo-700' },
  QUALIFIED: { label: '已确认', color: 'bg-purple-100 text-purple-700' },
  PROPOSAL: { label: '已报价', color: 'bg-emerald-100 text-emerald-700' },
  NEGOTIATION: { label: '谈判中', color: 'bg-orange-100 text-orange-700' },
  CLOSED_WON: { label: '已转化', color: 'bg-green-100 text-green-700' },
  CLOSED_LOST: { label: '已关闭', color: 'bg-gray-100 text-gray-700' },
};

// 线索筛选标签（按图设计）
export const LEAD_FILTER_TABS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'NEW', label: '新线索' },
  { key: 'CONTACTED', label: '联系中' },
  { key: 'QUALIFIED', label: '已确认' },
  { key: 'CLOSED_WON', label: '已转化' },
  { key: 'POOL', label: '公海' },
];

// 报价单状态
export const QUOTATION_STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'bg-gray-100 text-gray-800' },
  SENT: { label: '已发送', color: 'bg-blue-100 text-blue-800' },
  VIEWED: { label: '已查看', color: 'bg-indigo-100 text-indigo-800' },
  ACCEPTED: { label: '已接受', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: '已拒绝', color: 'bg-red-100 text-red-800' },
  EXPIRED: { label: '已过期', color: 'bg-yellow-100 text-yellow-800' },
};

// 订单状态
export const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待确认', color: 'bg-yellow-100 text-yellow-800' },
  CONFIRMED: { label: '已确认', color: 'bg-blue-100 text-blue-800' },
  IN_PRODUCTION: { label: '生产中', color: 'bg-indigo-100 text-indigo-800' },
  SHIPPED: { label: '已发货', color: 'bg-purple-100 text-purple-800' },
  DELIVERED: { label: '已交付', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: '已取消', color: 'bg-red-100 text-red-800' },
};

// 付款状态
export const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  UNPAID: { label: '未付款', color: 'bg-red-100 text-red-800' },
  PARTIAL: { label: '部分付款', color: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: '已付款', color: 'bg-green-100 text-green-800' },
  REFUNDED: { label: '已退款', color: 'bg-gray-100 text-gray-800' },
};

// 任务优先级
export const TASK_PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  LOW: { label: '低', color: 'bg-gray-100 text-gray-800' },
  MEDIUM: { label: '中', color: 'bg-blue-100 text-blue-800' },
  HIGH: { label: '高', color: 'bg-orange-100 text-orange-800' },
  URGENT: { label: '紧急', color: 'bg-red-100 text-red-800' },
};

// 任务状态
export const TASK_STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'bg-gray-100 text-gray-800' },
  IN_PROGRESS: { label: '进行中', color: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: '已完成', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: '已取消', color: 'bg-red-100 text-red-800' },
};

// 活动类型
export const ACTIVITY_TYPE_MAP: Record<string, { label: string; icon: string }> = {
  NOTE: { label: '备注', icon: '📝' },
  CALL: { label: '电话', icon: '📞' },
  MEETING: { label: '会议', icon: '🤝' },
  EMAIL: { label: '邮件', icon: '📧' },
  TASK: { label: '任务', icon: '✅' },
  STATUS_CHANGE: { label: '状态变更', icon: '🔄' },
  PRICE_DISCUSSION: { label: '价格讨论', icon: '💰' },
  ORDER_INTENT: { label: '下单意向', icon: '📋' },
  SAMPLE: { label: '样品', icon: '📦' },
  MOLD_FEE: { label: '模具费', icon: '🔧' },
  PAYMENT: { label: '付款', icon: '💳' },
  SHIPPING: { label: '发货/物流', icon: '🚢' },
  COMPLAINT: { label: '投诉/售后', icon: '⚠️' },
  VISIT: { label: '拜访', icon: '🏢' },
};

// 角色
export const ROLE_MAP: Record<string, string> = {
  ADMIN: '管理员',
  SALESPERSON: '业务员',
  FINANCE: '财务人员',
};

// 货币
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'CAD', 'HKD', 'SGD'];

// ==================== 形式发票 (PI) 选项 ====================

// PI 状态
export const PI_STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'bg-gray-100 text-gray-700' },
  PENDING_APPROVAL: { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: '已批准', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
};

// 贸易术语（国际贸易 Incoterms）
export const TRADE_TERMS: Array<{ value: string; label: string; desc: string }> = [
  { value: 'EXW', label: 'EXW', desc: '工厂交货' },
  { value: 'FCA', label: 'FCA', desc: '货交承运人' },
  { value: 'FAS', label: 'FAS', desc: '船边交货' },
  { value: 'FOB', label: 'FOB', desc: '船上交货' },
  { value: 'CFR', label: 'CFR', desc: '成本加运费' },
  { value: 'CIF', label: 'CIF', desc: '成本、保险加运费' },
  { value: 'CIP', label: 'CIP', desc: '运费、保险费付至' },
  { value: 'DPU', label: 'DPU', desc: '卸货地交货' },
  { value: 'DDP', label: 'DDP', desc: '完税后交货' },
];

// 付款条款
export const PAYMENT_TERMS: Array<{ value: string; label: string }> = [
  { value: 'T_30', label: '30% 预付 / 70% 发货前付清' },
  { value: 'T_50', label: '50% 预付 / 50% 发货前付清' },
  { value: 'T_70', label: '70% 预付 / 30% 发货前付清' },
  { value: 'T_100', label: '100% 预付' },
];

// 运输方式（下拉选择，中英文双显）
export const SHIPPING_METHODS: Array<{ value: string; label: string }> = [
  { value: 'By Sea', label: '海运 (By Sea)' },
  { value: 'By Air', label: '空运 (By Air)' },
  { value: 'By Express', label: '国际快递 (DHL / FedEx / UPS / TNT)' },
  { value: 'By Land', label: '陆运 (By Truck)' },
  { value: 'By Rail', label: '铁路运输 (By Rail)' },
  { value: 'By Post', label: '邮寄 (By Post / EMS)' },
  { value: 'Multimodal', label: '多式联运 (Multimodal Transport)' },
];

// 付款方式（下拉选择，以外贸常用方式为主）
export const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'T/T', label: '电汇 (T/T - Telegraphic Transfer)' },
  { value: 'L/C', label: '信用证 (L/C - Letter of Credit)' },
  { value: 'L/C at sight', label: '即期信用证 (L/C at sight)' },
  { value: 'D/P', label: '付款交单 (D/P - Documents against Payment)' },
  { value: 'D/A', label: '承兑交单 (D/A - Documents against Acceptance)' },
  { value: 'O/A', label: '赊账 (O/A - Open Account)' },
  { value: 'PayPal', label: 'PayPal' },
  { value: 'Western Union', label: '西联汇款 (Western Union)' },
  { value: 'Alipay', label: '支付宝 (Alipay)' },
  { value: 'Cash', label: '现金 (Cash)' },
  { value: 'Other', label: '其他 (Other)' },
];

// 常用装货 / 卸货港口（中国主要港口 + 国际常见港口）
export const COMMON_PORTS: string[] = [
  'Shanghai, China', 'Shenzhen, China', 'Ningbo, China', 'Qingdao, China',
  'Guangzhou, China', 'Tianjin, China', 'Xiamen, China', 'Dalian, China',
  'Hong Kong', 'Singapore', 'Busan, Korea', 'Tokyo, Japan',
  'Los Angeles, USA', 'New York, USA', 'Hamburg, Germany', 'Rotterdam, Netherlands',
];

// 国家/地区元数据：中文名 + ISO 3166-1 alpha-2 代码 + 英文名。
// 支持下拉组件按中文、英文、ISO 代码做模糊匹配（输入 "ES" / "西" / "Spain"
// 都能带出"西班牙"）。商用 CRM 场景下需覆盖世界上所有国家 / 地区。
export interface CountryMeta {
  name: string; // 中文名，入库/显示用
  code: string; // ISO 3166-1 alpha-2
  en: string;   // 英文常用名
}

export const COUNTRY_META: CountryMeta[] = [
  // 东亚 / 东北亚
  { name: '中国', code: 'CN', en: 'China' },
  { name: '日本', code: 'JP', en: 'Japan' },
  { name: '韩国', code: 'KR', en: 'South Korea' },
  { name: '朝鲜', code: 'KP', en: 'North Korea' },
  { name: '蒙古', code: 'MN', en: 'Mongolia' },
  { name: '香港地区', code: 'HK', en: 'Hong Kong' },
  { name: '澳门地区', code: 'MO', en: 'Macao' },
  { name: '台湾地区', code: 'TW', en: 'Taiwan' },
  // 东南亚
  { name: '越南', code: 'VN', en: 'Vietnam' },
  { name: '老挝', code: 'LA', en: 'Laos' },
  { name: '柬埔寨', code: 'KH', en: 'Cambodia' },
  { name: '缅甸', code: 'MM', en: 'Myanmar' },
  { name: '泰国', code: 'TH', en: 'Thailand' },
  { name: '马来西亚', code: 'MY', en: 'Malaysia' },
  { name: '新加坡', code: 'SG', en: 'Singapore' },
  { name: '印度尼西亚', code: 'ID', en: 'Indonesia' },
  { name: '东帝汶', code: 'TL', en: 'Timor-Leste' },
  { name: '菲律宾', code: 'PH', en: 'Philippines' },
  { name: '文莱', code: 'BN', en: 'Brunei' },
  // 南亚
  { name: '印度', code: 'IN', en: 'India' },
  { name: '巴基斯坦', code: 'PK', en: 'Pakistan' },
  { name: '孟加拉国', code: 'BD', en: 'Bangladesh' },
  { name: '斯里兰卡', code: 'LK', en: 'Sri Lanka' },
  { name: '尼泊尔', code: 'NP', en: 'Nepal' },
  { name: '不丹', code: 'BT', en: 'Bhutan' },
  { name: '马尔代夫', code: 'MV', en: 'Maldives' },
  { name: '阿富汗', code: 'AF', en: 'Afghanistan' },
  // 中亚
  { name: '哈萨克斯坦', code: 'KZ', en: 'Kazakhstan' },
  { name: '乌兹别克斯坦', code: 'UZ', en: 'Uzbekistan' },
  { name: '吉尔吉斯斯坦', code: 'KG', en: 'Kyrgyzstan' },
  { name: '塔吉克斯坦', code: 'TJ', en: 'Tajikistan' },
  { name: '土库曼斯坦', code: 'TM', en: 'Turkmenistan' },
  // 西亚 / 中东 / 高加索
  { name: '阿联酋', code: 'AE', en: 'United Arab Emirates' },
  { name: '沙特阿拉伯', code: 'SA', en: 'Saudi Arabia' },
  { name: '土耳其', code: 'TR', en: 'Turkey' },
  { name: '以色列', code: 'IL', en: 'Israel' },
  { name: '巴勒斯坦', code: 'PS', en: 'Palestine' },
  { name: '伊朗', code: 'IR', en: 'Iran' },
  { name: '伊拉克', code: 'IQ', en: 'Iraq' },
  { name: '叙利亚', code: 'SY', en: 'Syria' },
  { name: '约旦', code: 'JO', en: 'Jordan' },
  { name: '黎巴嫩', code: 'LB', en: 'Lebanon' },
  { name: '卡塔尔', code: 'QA', en: 'Qatar' },
  { name: '科威特', code: 'KW', en: 'Kuwait' },
  { name: '阿曼', code: 'OM', en: 'Oman' },
  { name: '巴林', code: 'BH', en: 'Bahrain' },
  { name: '也门', code: 'YE', en: 'Yemen' },
  { name: '塞浦路斯', code: 'CY', en: 'Cyprus' },
  { name: '亚美尼亚', code: 'AM', en: 'Armenia' },
  { name: '阿塞拜疆', code: 'AZ', en: 'Azerbaijan' },
  { name: '格鲁吉亚', code: 'GE', en: 'Georgia' },
  // 西欧 / 中欧
  { name: '英国', code: 'GB', en: 'United Kingdom' },
  { name: '爱尔兰', code: 'IE', en: 'Ireland' },
  { name: '法国', code: 'FR', en: 'France' },
  { name: '德国', code: 'DE', en: 'Germany' },
  { name: '意大利', code: 'IT', en: 'Italy' },
  { name: '西班牙', code: 'ES', en: 'Spain' },
  { name: '葡萄牙', code: 'PT', en: 'Portugal' },
  { name: '荷兰', code: 'NL', en: 'Netherlands' },
  { name: '比利时', code: 'BE', en: 'Belgium' },
  { name: '卢森堡', code: 'LU', en: 'Luxembourg' },
  { name: '瑞士', code: 'CH', en: 'Switzerland' },
  { name: '奥地利', code: 'AT', en: 'Austria' },
  { name: '列支敦士登', code: 'LI', en: 'Liechtenstein' },
  { name: '摩纳哥', code: 'MC', en: 'Monaco' },
  { name: '安道尔', code: 'AD', en: 'Andorra' },
  { name: '圣马力诺', code: 'SM', en: 'San Marino' },
  { name: '梵蒂冈', code: 'VA', en: 'Vatican City' },
  { name: '马耳他', code: 'MT', en: 'Malta' },
  // 北欧
  { name: '瑞典', code: 'SE', en: 'Sweden' },
  { name: '挪威', code: 'NO', en: 'Norway' },
  { name: '丹麦', code: 'DK', en: 'Denmark' },
  { name: '芬兰', code: 'FI', en: 'Finland' },
  { name: '冰岛', code: 'IS', en: 'Iceland' },
  // 东欧
  { name: '波兰', code: 'PL', en: 'Poland' },
  { name: '捷克', code: 'CZ', en: 'Czech Republic' },
  { name: '斯洛伐克', code: 'SK', en: 'Slovakia' },
  { name: '匈牙利', code: 'HU', en: 'Hungary' },
  { name: '罗马尼亚', code: 'RO', en: 'Romania' },
  { name: '保加利亚', code: 'BG', en: 'Bulgaria' },
  { name: '摩尔多瓦', code: 'MD', en: 'Moldova' },
  { name: '乌克兰', code: 'UA', en: 'Ukraine' },
  { name: '白俄罗斯', code: 'BY', en: 'Belarus' },
  { name: '俄罗斯', code: 'RU', en: 'Russia' },
  { name: '立陶宛', code: 'LT', en: 'Lithuania' },
  { name: '拉脱维亚', code: 'LV', en: 'Latvia' },
  { name: '爱沙尼亚', code: 'EE', en: 'Estonia' },
  // 南欧 / 巴尔干
  { name: '希腊', code: 'GR', en: 'Greece' },
  { name: '阿尔巴尼亚', code: 'AL', en: 'Albania' },
  { name: '北马其顿', code: 'MK', en: 'North Macedonia' },
  { name: '塞尔维亚', code: 'RS', en: 'Serbia' },
  { name: '黑山', code: 'ME', en: 'Montenegro' },
  { name: '波黑', code: 'BA', en: 'Bosnia and Herzegovina' },
  { name: '克罗地亚', code: 'HR', en: 'Croatia' },
  { name: '斯洛文尼亚', code: 'SI', en: 'Slovenia' },
  { name: '科索沃', code: 'XK', en: 'Kosovo' },
  // 北美
  { name: '美国', code: 'US', en: 'United States' },
  { name: '加拿大', code: 'CA', en: 'Canada' },
  { name: '墨西哥', code: 'MX', en: 'Mexico' },
  // 中美洲
  { name: '伯利兹', code: 'BZ', en: 'Belize' },
  { name: '危地马拉', code: 'GT', en: 'Guatemala' },
  { name: '洪都拉斯', code: 'HN', en: 'Honduras' },
  { name: '萨尔瓦多', code: 'SV', en: 'El Salvador' },
  { name: '尼加拉瓜', code: 'NI', en: 'Nicaragua' },
  { name: '哥斯达黎加', code: 'CR', en: 'Costa Rica' },
  { name: '巴拿马', code: 'PA', en: 'Panama' },
  // 加勒比
  { name: '古巴', code: 'CU', en: 'Cuba' },
  { name: '牙买加', code: 'JM', en: 'Jamaica' },
  { name: '海地', code: 'HT', en: 'Haiti' },
  { name: '多米尼加', code: 'DO', en: 'Dominican Republic' },
  { name: '巴哈马', code: 'BS', en: 'Bahamas' },
  { name: '巴巴多斯', code: 'BB', en: 'Barbados' },
  { name: '特立尼达和多巴哥', code: 'TT', en: 'Trinidad and Tobago' },
  { name: '格林纳达', code: 'GD', en: 'Grenada' },
  { name: '圣卢西亚', code: 'LC', en: 'Saint Lucia' },
  { name: '圣文森特和格林纳丁斯', code: 'VC', en: 'Saint Vincent and the Grenadines' },
  { name: '安提瓜和巴布达', code: 'AG', en: 'Antigua and Barbuda' },
  { name: '圣基茨和尼维斯', code: 'KN', en: 'Saint Kitts and Nevis' },
  { name: '多米尼克', code: 'DM', en: 'Dominica' },
  // 南美
  { name: '巴西', code: 'BR', en: 'Brazil' },
  { name: '阿根廷', code: 'AR', en: 'Argentina' },
  { name: '智利', code: 'CL', en: 'Chile' },
  { name: '哥伦比亚', code: 'CO', en: 'Colombia' },
  { name: '秘鲁', code: 'PE', en: 'Peru' },
  { name: '委内瑞拉', code: 'VE', en: 'Venezuela' },
  { name: '厄瓜多尔', code: 'EC', en: 'Ecuador' },
  { name: '玻利维亚', code: 'BO', en: 'Bolivia' },
  { name: '巴拉圭', code: 'PY', en: 'Paraguay' },
  { name: '乌拉圭', code: 'UY', en: 'Uruguay' },
  { name: '圭亚那', code: 'GY', en: 'Guyana' },
  { name: '苏里南', code: 'SR', en: 'Suriname' },
  // 北非
  { name: '埃及', code: 'EG', en: 'Egypt' },
  { name: '阿尔及利亚', code: 'DZ', en: 'Algeria' },
  { name: '突尼斯', code: 'TN', en: 'Tunisia' },
  { name: '利比亚', code: 'LY', en: 'Libya' },
  { name: '摩洛哥', code: 'MA', en: 'Morocco' },
  { name: '苏丹', code: 'SD', en: 'Sudan' },
  { name: '南苏丹', code: 'SS', en: 'South Sudan' },
  // 西非
  { name: '尼日利亚', code: 'NG', en: 'Nigeria' },
  { name: '加纳', code: 'GH', en: 'Ghana' },
  { name: '科特迪瓦', code: 'CI', en: "Côte d'Ivoire" },
  { name: '塞内加尔', code: 'SN', en: 'Senegal' },
  { name: '喀麦隆', code: 'CM', en: 'Cameroon' },
  { name: '贝宁', code: 'BJ', en: 'Benin' },
  { name: '多哥', code: 'TG', en: 'Togo' },
  { name: '利比里亚', code: 'LR', en: 'Liberia' },
  { name: '塞拉利昂', code: 'SL', en: 'Sierra Leone' },
  { name: '几内亚', code: 'GN', en: 'Guinea' },
  { name: '几内亚比绍', code: 'GW', en: 'Guinea-Bissau' },
  { name: '冈比亚', code: 'GM', en: 'Gambia' },
  { name: '毛里塔尼亚', code: 'MR', en: 'Mauritania' },
  { name: '马里', code: 'ML', en: 'Mali' },
  { name: '尼日尔', code: 'NE', en: 'Niger' },
  { name: '布基纳法索', code: 'BF', en: 'Burkina Faso' },
  { name: '佛得角', code: 'CV', en: 'Cape Verde' },
  // 中非
  { name: '乍得', code: 'TD', en: 'Chad' },
  { name: '中非共和国', code: 'CF', en: 'Central African Republic' },
  { name: '赤道几内亚', code: 'GQ', en: 'Equatorial Guinea' },
  { name: '加蓬', code: 'GA', en: 'Gabon' },
  { name: '刚果(布)', code: 'CG', en: 'Congo (Brazzaville)' },
  { name: '刚果(金)', code: 'CD', en: 'DR Congo' },
  { name: '圣多美和普林西比', code: 'ST', en: 'São Tomé and Príncipe' },
  // 东非
  { name: '埃塞俄比亚', code: 'ET', en: 'Ethiopia' },
  { name: '肯尼亚', code: 'KE', en: 'Kenya' },
  { name: '坦桑尼亚', code: 'TZ', en: 'Tanzania' },
  { name: '乌干达', code: 'UG', en: 'Uganda' },
  { name: '卢旺达', code: 'RW', en: 'Rwanda' },
  { name: '布隆迪', code: 'BI', en: 'Burundi' },
  { name: '厄立特里亚', code: 'ER', en: 'Eritrea' },
  { name: '索马里', code: 'SO', en: 'Somalia' },
  { name: '吉布提', code: 'DJ', en: 'Djibouti' },
  { name: '马达加斯加', code: 'MG', en: 'Madagascar' },
  { name: '毛里求斯', code: 'MU', en: 'Mauritius' },
  { name: '塞舌尔', code: 'SC', en: 'Seychelles' },
  { name: '科摩罗', code: 'KM', en: 'Comoros' },
  // 南部非洲
  { name: '南非', code: 'ZA', en: 'South Africa' },
  { name: '安哥拉', code: 'AO', en: 'Angola' },
  { name: '莫桑比克', code: 'MZ', en: 'Mozambique' },
  { name: '赞比亚', code: 'ZM', en: 'Zambia' },
  { name: '津巴布韦', code: 'ZW', en: 'Zimbabwe' },
  { name: '马拉维', code: 'MW', en: 'Malawi' },
  { name: '博茨瓦纳', code: 'BW', en: 'Botswana' },
  { name: '纳米比亚', code: 'NA', en: 'Namibia' },
  { name: '莱索托', code: 'LS', en: 'Lesotho' },
  { name: '斯威士兰', code: 'SZ', en: 'Eswatini' },
  // 大洋洲
  { name: '澳大利亚', code: 'AU', en: 'Australia' },
  { name: '新西兰', code: 'NZ', en: 'New Zealand' },
  { name: '巴布亚新几内亚', code: 'PG', en: 'Papua New Guinea' },
  { name: '斐济', code: 'FJ', en: 'Fiji' },
  { name: '所罗门群岛', code: 'SB', en: 'Solomon Islands' },
  { name: '瓦努阿图', code: 'VU', en: 'Vanuatu' },
  { name: '萨摩亚', code: 'WS', en: 'Samoa' },
  { name: '汤加', code: 'TO', en: 'Tonga' },
  { name: '基里巴斯', code: 'KI', en: 'Kiribati' },
  { name: '图瓦卢', code: 'TV', en: 'Tuvalu' },
  { name: '瑙鲁', code: 'NR', en: 'Nauru' },
  { name: '马绍尔群岛', code: 'MH', en: 'Marshall Islands' },
  { name: '密克罗尼西亚', code: 'FM', en: 'Micronesia' },
  { name: '帕劳', code: 'PW', en: 'Palau' },
  // 其他
  { name: '其他', code: '', en: 'Other' },
];

// 供旧代码按中文名遍历使用；保持与 COUNTRY_META 同步。
export const COUNTRIES = COUNTRY_META.map((c) => c.name);

// 客户来源
export const CUSTOMER_SOURCES = [
  '展会',
  '阿里巴巴',
  'Google广告',
  'LinkedIn',
  'Facebook',
  'Instagram',
  'TikTok',
  'Twitter/X',
  'YouTube',
  'Pinterest',
  'WhatsApp',
  '客户推荐',
  '电话开发',
  '邮件开发',
  '独立站',
  '其他',
];

// 行业
export const INDUSTRIES = [
  '电子产品',
  '纺织服装',
  '机械设备',
  '化工材料',
  '家居用品',
  '汽车配件',
  '食品饮料',
  '医疗器械',
  '建筑材料',
  '其他',
];
