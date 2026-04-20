/**
 * 节假日种子数据。
 * - 2026 年中国法定节假日依据国务院办公厅发布的安排；
 * - 农历节日（春节/端午/中秋等）已预先转换成公历；
 * - 常见国际/西方节日也一并带入，方便外贸场景直接使用。
 *
 * 管理员每到新的一年，应在 /admin/holidays 页面更新或批量导入当年数据。
 * 这里只作为首次部署/本地开发的初始数据。
 */
import { PrismaClient } from '@prisma/client';

interface Item {
  date: string; // YYYY-MM-DD
  name: string;
  nameEn?: string;
  type: 'CN' | 'CN_TRAD' | 'INTL' | 'EU' | 'IN' | 'OBS';
  isOff?: boolean;
  lunar?: boolean;
  note?: string;
}

const HOLIDAYS_2026: Item[] = [
  // —— 中国法定节假日 ——
  { date: '2026-01-01', name: '元旦', nameEn: "New Year's Day", type: 'CN', isOff: true },
  { date: '2026-02-16', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-17', name: '春节', nameEn: 'Chinese New Year', type: 'CN', isOff: true, lunar: true, note: '正月初一' },
  { date: '2026-02-18', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-19', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-20', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-21', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-22', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-23', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-02-24', name: '春节假期', nameEn: 'Spring Festival', type: 'CN', isOff: true },
  { date: '2026-04-04', name: '清明节', nameEn: 'Qingming Festival', type: 'CN', isOff: true },
  { date: '2026-04-05', name: '清明节', nameEn: 'Qingming Festival', type: 'CN', isOff: true },
  { date: '2026-04-06', name: '清明节', nameEn: 'Qingming Festival', type: 'CN', isOff: true },
  { date: '2026-05-01', name: '劳动节', nameEn: "Labour Day", type: 'CN', isOff: true },
  { date: '2026-05-02', name: '劳动节', nameEn: "Labour Day", type: 'CN', isOff: true },
  { date: '2026-05-03', name: '劳动节', nameEn: "Labour Day", type: 'CN', isOff: true },
  { date: '2026-05-04', name: '劳动节', nameEn: "Labour Day", type: 'CN', isOff: true },
  { date: '2026-05-05', name: '劳动节', nameEn: "Labour Day", type: 'CN', isOff: true },
  { date: '2026-06-19', name: '端午节', nameEn: 'Dragon Boat Festival', type: 'CN', isOff: true, lunar: true, note: '五月初五' },
  { date: '2026-06-20', name: '端午节', nameEn: 'Dragon Boat Festival', type: 'CN', isOff: true },
  { date: '2026-06-21', name: '端午节', nameEn: 'Dragon Boat Festival', type: 'CN', isOff: true },
  { date: '2026-09-25', name: '中秋节', nameEn: 'Mid-Autumn Festival', type: 'CN', isOff: true, lunar: true, note: '八月十五' },
  { date: '2026-09-26', name: '中秋节', nameEn: 'Mid-Autumn Festival', type: 'CN', isOff: true },
  { date: '2026-09-27', name: '中秋节', nameEn: 'Mid-Autumn Festival', type: 'CN', isOff: true },
  { date: '2026-10-01', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },
  { date: '2026-10-02', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },
  { date: '2026-10-03', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },
  { date: '2026-10-04', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },
  { date: '2026-10-05', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },
  { date: '2026-10-06', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },
  { date: '2026-10-07', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },

  // —— 中国传统节日（非法定） ——
  { date: '2026-03-03', name: '元宵节', nameEn: 'Lantern Festival', type: 'CN_TRAD', lunar: true, note: '正月十五' },
  { date: '2026-03-08', name: '妇女节', nameEn: "Women's Day", type: 'CN_TRAD' },
  { date: '2026-03-12', name: '植树节', nameEn: 'Arbor Day', type: 'CN_TRAD' },
  { date: '2026-05-04', name: '青年节', nameEn: 'Youth Day', type: 'CN_TRAD' },
  { date: '2026-06-01', name: '儿童节', nameEn: "Children's Day", type: 'CN_TRAD' },
  { date: '2026-07-01', name: '建党节', nameEn: 'CPC Founding Day', type: 'CN_TRAD' },
  { date: '2026-08-01', name: '建军节', nameEn: 'PLA Day', type: 'CN_TRAD' },
  { date: '2026-08-19', name: '七夕', nameEn: 'Qixi Festival', type: 'CN_TRAD', lunar: true, note: '七月初七' },
  { date: '2026-09-10', name: '教师节', nameEn: "Teachers' Day", type: 'CN_TRAD' },
  { date: '2026-10-18', name: '重阳节', nameEn: 'Double Ninth Festival', type: 'CN_TRAD', lunar: true, note: '九月初九' },
  { date: '2026-12-18', name: '腊八节', nameEn: 'Laba Festival', type: 'CN_TRAD', lunar: true, note: '腊月初八' },

  // —— 国际/西方节日 ——
  { date: '2026-02-02', name: '圣烛节', nameEn: 'Groundhog Day', type: 'INTL' },
  { date: '2026-02-14', name: '情人节', nameEn: "Valentine's Day", type: 'INTL' },
  { date: '2026-02-16', name: '总统日', nameEn: "Presidents' Day", type: 'INTL', note: '美国' },
  { date: '2026-03-17', name: '圣帕特里克节', nameEn: "St. Patrick's Day", type: 'INTL' },
  { date: '2026-04-01', name: '愚人节', nameEn: "April Fool's Day", type: 'INTL' },
  { date: '2026-04-05', name: '复活节', nameEn: 'Easter Sunday', type: 'INTL' },
  { date: '2026-05-10', name: '母亲节', nameEn: "Mother's Day", type: 'INTL' },
  { date: '2026-05-25', name: '阵亡将士纪念日', nameEn: 'Memorial Day', type: 'INTL', note: '美国' },
  { date: '2026-06-21', name: '父亲节', nameEn: "Father's Day", type: 'INTL' },
  { date: '2026-07-04', name: '美国独立日', nameEn: 'Independence Day', type: 'INTL' },
  { date: '2026-09-07', name: '劳工节', nameEn: 'Labor Day', type: 'INTL', note: '美国' },
  { date: '2026-10-12', name: '哥伦布日', nameEn: 'Columbus Day', type: 'INTL', note: '美国' },
  { date: '2026-10-31', name: '万圣节前夜', nameEn: 'Halloween', type: 'INTL' },
  { date: '2026-11-11', name: '退伍军人节', nameEn: 'Veterans Day', type: 'INTL', note: '美国' },
  { date: '2026-11-26', name: '感恩节', nameEn: 'Thanksgiving', type: 'INTL', note: '美国' },
  { date: '2026-11-27', name: '黑色星期五', nameEn: 'Black Friday', type: 'INTL' },
  { date: '2026-12-24', name: '平安夜', nameEn: 'Christmas Eve', type: 'INTL' },
  { date: '2026-12-25', name: '圣诞节', nameEn: 'Christmas Day', type: 'INTL' },
  { date: '2026-12-26', name: '节礼日', nameEn: 'Boxing Day', type: 'INTL', note: '英/加/澳' },
  { date: '2026-12-31', name: '除夕（公历）', nameEn: "New Year's Eve", type: 'INTL' },

  // —— 欧洲节日 ——（英/德/法/意/西，影响外贸收发邮件节奏）
  { date: '2026-01-06', name: '主显节', nameEn: 'Epiphany', type: 'EU', note: '意/西/德部分州' },
  { date: '2026-04-03', name: '耶稣受难日', nameEn: 'Good Friday', type: 'EU', isOff: true, note: '英/德/法(阿)/北欧' },
  { date: '2026-04-05', name: '复活节周日', nameEn: 'Easter Sunday', type: 'EU', isOff: true },
  { date: '2026-04-06', name: '复活节周一', nameEn: 'Easter Monday', type: 'EU', isOff: true, note: '英/德/法/意等' },
  { date: '2026-04-25', name: '意大利解放日', nameEn: 'Liberation Day', type: 'EU', isOff: true, note: '意大利' },
  { date: '2026-04-27', name: '荷兰国王日', nameEn: "King's Day", type: 'EU', isOff: true, note: '荷兰' },
  { date: '2026-05-01', name: '欧洲劳动节', nameEn: 'Labour Day', type: 'EU', isOff: true, note: '德/法/意/西等多数欧盟国家' },
  { date: '2026-05-04', name: '英国五月银行假日', nameEn: 'Early May Bank Holiday', type: 'EU', isOff: true, note: '英国' },
  { date: '2026-05-08', name: '法国二战胜利日', nameEn: 'Victory Day', type: 'EU', isOff: true, note: '法国' },
  { date: '2026-05-14', name: '耶稣升天节', nameEn: 'Ascension Day', type: 'EU', isOff: true, note: '德/法/北欧' },
  { date: '2026-05-24', name: '五旬节', nameEn: 'Pentecost', type: 'EU', note: '德/法/意等' },
  { date: '2026-05-25', name: '圣灵降临节星期一', nameEn: 'Whit Monday', type: 'EU', isOff: true, note: '德/法/北欧' },
  { date: '2026-05-25', name: '英国春季银行假日', nameEn: 'Spring Bank Holiday', type: 'EU', isOff: true, note: '英国' },
  { date: '2026-06-02', name: '意大利共和国日', nameEn: 'Republic Day', type: 'EU', isOff: true, note: '意大利' },
  { date: '2026-07-14', name: '法国国庆节', nameEn: 'Bastille Day', type: 'EU', isOff: true, note: '法国' },
  { date: '2026-08-15', name: '圣母升天节', nameEn: 'Assumption', type: 'EU', isOff: true, note: '法/意/西/葡/比/德部分州' },
  { date: '2026-08-31', name: '英国夏季银行假日', nameEn: 'Summer Bank Holiday', type: 'EU', isOff: true, note: '英国' },
  { date: '2026-10-03', name: '德国统一日', nameEn: 'Day of German Unity', type: 'EU', isOff: true, note: '德国' },
  { date: '2026-10-12', name: '西班牙国庆日', nameEn: 'Fiesta Nacional de España', type: 'EU', isOff: true, note: '西班牙' },
  { date: '2026-11-01', name: '诸圣节', nameEn: "All Saints' Day", type: 'EU', isOff: true, note: '法/意/西/葡/波兰/德部分州' },
  { date: '2026-11-11', name: '休战日', nameEn: 'Armistice Day', type: 'EU', isOff: true, note: '法国/比利时' },
  { date: '2026-12-06', name: '西班牙宪法日', nameEn: 'Constitution Day', type: 'EU', isOff: true, note: '西班牙' },
  { date: '2026-12-08', name: '圣母无染原罪节', nameEn: 'Immaculate Conception', type: 'EU', isOff: true, note: '意/西/葡/奥' },
  { date: '2026-12-26', name: '圣斯蒂芬日', nameEn: "St. Stephen's Day", type: 'EU', isOff: true, note: '意/德/北欧' },

  // —— 欧洲休假高峰期 / 观察期 ——（外贸通常会邮件石沉大海，提前安排）
  { date: '2026-07-15', name: '欧洲夏休开始', nameEn: 'EU Summer Holiday starts', type: 'OBS', note: '欧洲工厂 / 办公室陆续进入夏休，邮件响应变慢' },
  { date: '2026-08-01', name: '欧洲夏休高峰', nameEn: 'EU Summer Holiday peak', type: 'OBS', note: '法/意/西等几乎全员休假，预计 2-4 周无法响应' },
  { date: '2026-08-15', name: '南欧夏休峰值（Ferragosto）', nameEn: 'Ferragosto', type: 'OBS', note: '意大利全国停摆高峰' },
  { date: '2026-08-31', name: '欧洲夏休结束', nameEn: 'EU Summer Holiday ends', type: 'OBS', note: '欧洲开始复工' },
  { date: '2026-12-22', name: '欧洲圣诞假期开始', nameEn: 'EU Christmas Holiday starts', type: 'OBS', note: '大多数欧洲公司进入假期' },
  { date: '2027-01-06', name: '欧洲圣诞假期结束', nameEn: 'EU Christmas Holiday ends', type: 'OBS', note: '节后复工' },

  // —— 印度节日 ——（外贸客户集中在孟买/德里/班加罗尔时特别重要）
  { date: '2026-01-14', name: '丰收节（桑克兰蒂）', nameEn: 'Makar Sankranti / Pongal', type: 'IN' },
  { date: '2026-01-26', name: '共和国日', nameEn: 'Republic Day', type: 'IN', isOff: true },
  { date: '2026-02-15', name: '湿婆之夜', nameEn: 'Maha Shivaratri', type: 'IN' },
  { date: '2026-03-03', name: '洒红节（Holi 前夕）', nameEn: 'Holika Dahan', type: 'IN' },
  { date: '2026-03-04', name: '洒红节', nameEn: 'Holi', type: 'IN', isOff: true, note: '印度重要节日，多日庆祝' },
  { date: '2026-03-19', name: '新年（乌迪/古迪）', nameEn: 'Ugadi / Gudi Padwa', type: 'IN' },
  { date: '2026-03-20', name: '开斋节', nameEn: 'Eid al-Fitr', type: 'IN', isOff: true, note: '伊斯兰历，依新月' },
  { date: '2026-03-26', name: '罗摩诞辰', nameEn: 'Ram Navami', type: 'IN' },
  { date: '2026-04-14', name: '安贝德卡尔纪念日', nameEn: 'Ambedkar Jayanti', type: 'IN' },
  { date: '2026-05-27', name: '宰牲节', nameEn: 'Eid al-Adha', type: 'IN', isOff: true, note: '依新月日期会有 1-2 天浮动' },
  { date: '2026-08-15', name: '印度独立日', nameEn: 'Independence Day', type: 'IN', isOff: true },
  { date: '2026-08-27', name: '系兄妹带节', nameEn: 'Raksha Bandhan', type: 'IN' },
  { date: '2026-09-04', name: '克利须那诞辰', nameEn: 'Janmashtami', type: 'IN' },
  { date: '2026-09-14', name: '象神节', nameEn: 'Ganesh Chaturthi', type: 'IN' },
  { date: '2026-10-02', name: '甘地诞辰纪念日', nameEn: 'Gandhi Jayanti', type: 'IN', isOff: true },
  { date: '2026-10-20', name: '十胜节', nameEn: 'Dussehra', type: 'IN', isOff: true },
  { date: '2026-11-08', name: '排灯节', nameEn: 'Diwali', type: 'IN', isOff: true, note: '印度最重要节日，前后各 1-2 天全国放假' },
  { date: '2026-11-24', name: '古鲁纳纳克诞辰', nameEn: 'Guru Nanak Jayanti', type: 'IN', isOff: true },
  { date: '2026-12-25', name: '圣诞节（印度假日）', nameEn: 'Christmas', type: 'IN', isOff: true },
];

const HOLIDAYS_2027: Item[] = [
  { date: '2027-01-01', name: '元旦', nameEn: "New Year's Day", type: 'CN', isOff: true },
  { date: '2027-02-06', name: '春节', nameEn: 'Chinese New Year', type: 'CN', isOff: true, lunar: true, note: '正月初一' },
  { date: '2027-04-05', name: '清明节', nameEn: 'Qingming Festival', type: 'CN', isOff: true },
  { date: '2027-05-01', name: '劳动节', nameEn: "Labour Day", type: 'CN', isOff: true },
  { date: '2027-06-09', name: '端午节', nameEn: 'Dragon Boat Festival', type: 'CN', isOff: true, lunar: true, note: '五月初五' },
  { date: '2027-09-15', name: '中秋节', nameEn: 'Mid-Autumn Festival', type: 'CN', isOff: true, lunar: true, note: '八月十五' },
  { date: '2027-10-01', name: '国庆节', nameEn: 'National Day', type: 'CN', isOff: true },

  { date: '2027-02-14', name: '情人节', nameEn: "Valentine's Day", type: 'INTL' },
  { date: '2027-03-28', name: '复活节', nameEn: 'Easter Sunday', type: 'INTL' },
  { date: '2027-07-04', name: '美国独立日', nameEn: 'Independence Day', type: 'INTL' },
  { date: '2027-10-31', name: '万圣节前夜', nameEn: 'Halloween', type: 'INTL' },
  { date: '2027-11-25', name: '感恩节', nameEn: 'Thanksgiving', type: 'INTL', note: '美国' },
  { date: '2027-12-25', name: '圣诞节', nameEn: 'Christmas Day', type: 'INTL' },
];

async function seedHolidays(prisma: PrismaClient) {
  const existing = await prisma.holiday.count();
  if (existing > 0) {
    console.log('节假日数据已存在，跳过');
    return;
  }

  const all: Item[] = [...HOLIDAYS_2026, ...HOLIDAYS_2027];
  await prisma.holiday.createMany({
    data: all.map((h) => ({
      year: parseInt(h.date.slice(0, 4), 10),
      date: new Date(`${h.date}T00:00:00.000Z`),
      name: h.name,
      nameEn: h.nameEn,
      type: h.type,
      isOff: h.isOff ?? false,
      lunar: h.lunar ?? false,
      note: h.note,
    })),
    skipDuplicates: true,
  });
  console.log(`节假日数据已导入（${all.length} 条）`);
}

export { seedHolidays };

if (require.main === module) {
  const prisma = new PrismaClient();
  seedHolidays(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
