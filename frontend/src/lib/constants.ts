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
};

// 货币
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY'];

// 国家/地区（按区域分组，覆盖主要外贸伙伴国）
export const COUNTRIES = [
  // 亚洲
  '中国', '日本', '韩国', '印度', '新加坡', '马来西亚', '泰国', '越南',
  '印度尼西亚', '菲律宾', '缅甸', '柬埔寨', '巴基斯坦', '孟加拉国',
  '斯里兰卡', '台湾地区', '香港地区',
  // 中东
  '阿联酋', '沙特阿拉伯', '土耳其', '以色列', '伊朗', '伊拉克',
  '卡塔尔', '科威特', '阿曼', '约旦', '黎巴嫩', '巴林',
  // 欧洲
  '英国', '德国', '法国', '意大利', '西班牙', '荷兰', '比利时',
  '波兰', '瑞典', '瑞士', '奥地利', '葡萄牙', '希腊', '捷克',
  '匈牙利', '丹麦', '芬兰', '挪威', '爱尔兰', '罗马尼亚',
  // 美洲
  '美国', '加拿大', '巴西', '墨西哥', '阿根廷', '智利', '哥伦比亚', '秘鲁',
  // 非洲
  '南非', '埃及', '尼日利亚', '肯尼亚', '摩洛哥', '加纳', '坦桑尼亚', '埃塞俄比亚',
  // 大洋洲
  '澳大利亚', '新西兰',
  // 其他
  '俄罗斯', '乌克兰', '其他',
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
