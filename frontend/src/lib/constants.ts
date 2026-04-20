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

// 国家/地区（按区域分组，覆盖 ISO 3166-1 所有主权国家 + 常用特别行政区 / 地区）。
// 商用 CRM 场景下保证世界任何国家的客户都能录入；下拉默认按区域分块。
export const COUNTRIES = [
  // 东亚 / 东北亚
  '中国', '日本', '韩国', '朝鲜', '蒙古',
  '香港地区', '澳门地区', '台湾地区',
  // 东南亚
  '越南', '老挝', '柬埔寨', '缅甸', '泰国', '马来西亚', '新加坡',
  '印度尼西亚', '东帝汶', '菲律宾', '文莱',
  // 南亚
  '印度', '巴基斯坦', '孟加拉国', '斯里兰卡', '尼泊尔', '不丹', '马尔代夫', '阿富汗',
  // 中亚
  '哈萨克斯坦', '乌兹别克斯坦', '吉尔吉斯斯坦', '塔吉克斯坦', '土库曼斯坦',
  // 西亚 / 中东 / 高加索
  '阿联酋', '沙特阿拉伯', '土耳其', '以色列', '巴勒斯坦', '伊朗', '伊拉克', '叙利亚',
  '约旦', '黎巴嫩', '卡塔尔', '科威特', '阿曼', '巴林', '也门',
  '塞浦路斯', '亚美尼亚', '阿塞拜疆', '格鲁吉亚',
  // 西欧 / 中欧
  '英国', '爱尔兰', '法国', '德国', '意大利', '西班牙', '葡萄牙',
  '荷兰', '比利时', '卢森堡', '瑞士', '奥地利', '列支敦士登', '摩纳哥',
  '安道尔', '圣马力诺', '梵蒂冈', '马耳他',
  // 北欧
  '瑞典', '挪威', '丹麦', '芬兰', '冰岛',
  // 东欧
  '波兰', '捷克', '斯洛伐克', '匈牙利', '罗马尼亚', '保加利亚', '摩尔多瓦',
  '乌克兰', '白俄罗斯', '俄罗斯', '立陶宛', '拉脱维亚', '爱沙尼亚',
  // 南欧 / 巴尔干
  '希腊', '阿尔巴尼亚', '北马其顿', '塞尔维亚', '黑山',
  '波黑', '克罗地亚', '斯洛文尼亚', '科索沃',
  // 北美
  '美国', '加拿大', '墨西哥',
  // 中美洲
  '伯利兹', '危地马拉', '洪都拉斯', '萨尔瓦多', '尼加拉瓜', '哥斯达黎加', '巴拿马',
  // 加勒比
  '古巴', '牙买加', '海地', '多米尼加', '巴哈马', '巴巴多斯',
  '特立尼达和多巴哥', '格林纳达', '圣卢西亚', '圣文森特和格林纳丁斯',
  '安提瓜和巴布达', '圣基茨和尼维斯', '多米尼克',
  // 南美
  '巴西', '阿根廷', '智利', '哥伦比亚', '秘鲁', '委内瑞拉',
  '厄瓜多尔', '玻利维亚', '巴拉圭', '乌拉圭', '圭亚那', '苏里南',
  // 北非
  '埃及', '阿尔及利亚', '突尼斯', '利比亚', '摩洛哥', '苏丹', '南苏丹',
  // 西非
  '尼日利亚', '加纳', '科特迪瓦', '塞内加尔', '喀麦隆', '贝宁', '多哥',
  '利比里亚', '塞拉利昂', '几内亚', '几内亚比绍', '冈比亚', '毛里塔尼亚',
  '马里', '尼日尔', '布基纳法索', '佛得角',
  // 中非
  '乍得', '中非共和国', '赤道几内亚', '加蓬',
  '刚果(布)', '刚果(金)', '圣多美和普林西比',
  // 东非
  '埃塞俄比亚', '肯尼亚', '坦桑尼亚', '乌干达', '卢旺达', '布隆迪',
  '厄立特里亚', '索马里', '吉布提', '马达加斯加',
  '毛里求斯', '塞舌尔', '科摩罗',
  // 南部非洲
  '南非', '安哥拉', '莫桑比克', '赞比亚', '津巴布韦', '马拉维',
  '博茨瓦纳', '纳米比亚', '莱索托', '斯威士兰',
  // 大洋洲
  '澳大利亚', '新西兰', '巴布亚新几内亚', '斐济', '所罗门群岛', '瓦努阿图',
  '萨摩亚', '汤加', '基里巴斯', '图瓦卢', '瑙鲁',
  '马绍尔群岛', '密克罗尼西亚', '帕劳',
  // 其他
  '其他',
];

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
