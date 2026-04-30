// 主要都市の路線・駅データ（PoC版・主要駅のみ）
//
// name / line.name : 日本語表記（デフォルト）
// nameEn / line.nameEn : 英語表記（?lang=en で使う）
// stations: 日本語駅名の配列（API クエリにはこちらをそのまま使う）
// 英語駅名は STATION_NAMES_EN（下部）で日本語名→英語名の辞書として持つ。

export const CITIES = [
  {
    id: 'tokyo',
    name: '東京', nameEn: 'Tokyo',
    center: { lat: 35.6812, lng: 139.7671 },
    bounds: { sw: { lat: 35.50, lng: 139.55 }, ne: { lat: 35.85, lng: 139.95 } },
    lines: [
      { name: 'JR山手線',         nameEn: 'JR Yamanote Line',
        stations: ['東京', '有楽町', '新橋', '浜松町', '田町', '高輪ゲートウェイ', '品川', '大崎', '五反田', '目黒', '恵比寿', '渋谷', '原宿', '代々木', '新宿', '新大久保', '高田馬場', '目白', '池袋', '大塚', '巣鴨', '駒込', '田端', '西日暮里', '日暮里', '鶯谷', '上野', '御徒町', '秋葉原', '神田'] },
      { name: 'JR中央線快速',     nameEn: 'JR Chuo Line (Rapid)',
        stations: ['東京', '神田', '御茶ノ水', '四ツ谷', '新宿', '中野', '高円寺', '阿佐ヶ谷', '荻窪', '西荻窪', '吉祥寺', '三鷹'] },
      { name: '東京メトロ銀座線', nameEn: 'Tokyo Metro Ginza Line',
        stations: ['浅草', '田原町', '稲荷町', '上野', '上野広小路', '末広町', '神田', '三越前', '日本橋', '京橋', '銀座', '新橋', '虎ノ門', '溜池山王', '赤坂見附', '青山一丁目', '外苑前', '表参道', '渋谷'] },
      { name: '東京メトロ丸ノ内線', nameEn: 'Tokyo Metro Marunouchi Line',
        stations: ['池袋', '茗荷谷', '後楽園', '本郷三丁目', '御茶ノ水', '大手町', '東京', '銀座', '霞ケ関', '国会議事堂前', '赤坂見附', '四ツ谷', '新宿御苑前', '新宿', '中野坂上', '荻窪'] },
      { name: '都営大江戸線',     nameEn: 'Toei Oedo Line',
        stations: ['新宿', '都庁前', '六本木', '麻布十番', '汐留', '築地市場', '門前仲町', '清澄白河', '両国', '蔵前', '新御徒町', '上野御徒町', '春日', '飯田橋', '牛込神楽坂'] },
    ],
  },
  {
    id: 'nagoya',
    name: '名古屋', nameEn: 'Nagoya',
    center: { lat: 35.1815, lng: 136.9066 },
    bounds: { sw: { lat: 35.05, lng: 136.78 }, ne: { lat: 35.30, lng: 137.05 } },
    lines: [
      { name: '名古屋市営地下鉄 東山線',  nameEn: 'Nagoya Subway Higashiyama Line',
        stations: ['高畑', '八田', '岩塚', '中村公園', '中村日赤', '本陣', '亀島', '名古屋', '伏見', '栄', '新栄町', '千種', '今池', '池下', '覚王山', '本山', '東山公園', '星ヶ丘', '一社', '上社', '本郷', '藤が丘'] },
      { name: '名古屋市営地下鉄 名城線',  nameEn: 'Nagoya Subway Meijo Line',
        stations: ['ナゴヤドーム前矢田', '砂田橋', '茶屋ヶ坂', '自由ヶ丘', '本山', '名古屋大学', '八事日赤', '八事', '総合リハビリセンター', '瑞穂運動場東', '新瑞橋', '妙音通', '堀田', '伝馬町', '神宮西', '西高蔵', '金山', '東別院', '上前津', '矢場町', '栄', '久屋大通', '市役所', '名城公園', '黒川', '志賀本通', '平安通', '大曽根'] },
      { name: '名古屋市営地下鉄 名港線',  nameEn: 'Nagoya Subway Meiko Line',
        stations: ['金山', '日比野', '六番町', '東海通', '港区役所', '築地口', '名古屋港'] },
      { name: '名古屋市営地下鉄 上飯田線', nameEn: 'Nagoya Subway Kamiiida Line',
        stations: ['平安通', '上飯田'] },
      { name: '名古屋市営地下鉄 鶴舞線',  nameEn: 'Nagoya Subway Tsurumai Line',
        stations: ['上小田井', '庄内緑地公園', '庄内通', '浄心', '浅間町', '丸の内', '伏見', '大須観音', '上前津', '鶴舞', '荒畑', '御器所', '川名', 'いりなか', '八事', '塩釜口', '植田', '原', '平針', '赤池'] },
      { name: '名古屋市営地下鉄 桜通線',  nameEn: 'Nagoya Subway Sakura-dori Line',
        stations: ['中村区役所', '太閤通', '名古屋', '国際センター', '丸の内', '久屋大通', '高岳', '車道', '今池', '吹上', '御器所', '桜山', '瑞穂区役所', '瑞穂運動場西', '新瑞橋', '桜本町', '鶴里', '野並', '徳重'] },
      { name: '名鉄 名古屋本線',          nameEn: 'Meitetsu Nagoya Main Line',
        stations: ['名鉄名古屋', '金山', '神宮前', '堀田', '呼続', '本笠寺', '鳴海', '左京山', '有松', '中京競馬場前', '前後', '豊明', '富士松', '一ツ木', '知立', '東岡崎'] },
      { name: 'JR 中央本線',              nameEn: 'JR Chuo Main Line',
        stations: ['名古屋', '千種', '大曽根', '新守山', '勝川', '春日井', '神領', '高蔵寺', '定光寺', '古虎渓', '多治見'] },
    ],
  },
  {
    id: 'osaka',
    name: '大阪', nameEn: 'Osaka',
    center: { lat: 34.6937, lng: 135.5023 },
    bounds: { sw: { lat: 34.55, lng: 135.35 }, ne: { lat: 34.85, lng: 135.65 } },
    lines: [
      { name: '大阪メトロ御堂筋線', nameEn: 'Osaka Metro Midosuji Line',
        stations: ['江坂', '東三国', '新大阪', '西中島南方', '中津', '梅田', '淀屋橋', '本町', '心斎橋', 'なんば', '大国町', '動物園前', '天王寺', '昭和町', '西田辺', '長居', 'あびこ', '北花田', '新金岡', '中百舌鳥'] },
      { name: '大阪メトロ谷町線',   nameEn: 'Osaka Metro Tanimachi Line',
        stations: ['大日', '守口', '太子橋今市', '千林大宮', '関目高殿', '野江内代', '都島', '天神橋筋六丁目', '中崎町', '東梅田', '南森町', '天満橋', '谷町四丁目', '谷町六丁目', '谷町九丁目', '四天王寺前夕陽ケ丘', '天王寺', '阿倍野', '文の里', '田辺', '駒川中野', '平野', '喜連瓜破', '出戸', '長原', '八尾南'] },
      { name: 'JR大阪環状線',       nameEn: 'JR Osaka Loop Line',
        stations: ['大阪', '天満', '桜ノ宮', '京橋', '大阪城公園', '森ノ宮', '玉造', '鶴橋', '桃谷', '寺田町', '天王寺', '新今宮', '今宮', '芦原橋', '大正', '弁天町', '西九条', '野田', '福島'] },
      { name: '阪急京都線',         nameEn: 'Hankyu Kyoto Line',
        stations: ['大阪梅田', '十三', '南方', '崇禅寺', '淡路', '上新庄', '相川', '正雀', '摂津市', '南茨木', '茨木市', '富田', '高槻市'] },
    ],
  },
  {
    id: 'kobe',
    name: '神戸', nameEn: 'Kobe',
    center: { lat: 34.6900, lng: 135.1955 },
    bounds: { sw: { lat: 34.60, lng: 134.95 }, ne: { lat: 34.80, lng: 135.40 } },
    lines: [
      { name: 'JR神戸線',                       nameEn: 'JR Kobe Line',
        stations: ['尼崎', '立花', '甲子園口', '西宮', 'さくら夙川', '芦屋', '甲南山手', '摂津本山', '住吉', '六甲道', '灘', '三ノ宮', '元町', '神戸', '兵庫', '新長田', '鷹取', '須磨海浜公園', '須磨', '塩屋', '垂水', '舞子', '朝霧', '明石'] },
      { name: '阪急神戸線',                     nameEn: 'Hankyu Kobe Line',
        stations: ['大阪梅田', '中津', '十三', '神崎川', '園田', '塚口', '武庫之荘', '西宮北口', '夙川', '芦屋川', '岡本', '御影', '六甲', '王子公園', '春日野道', '神戸三宮'] },
      { name: '神戸市営地下鉄西神・山手線',     nameEn: 'Kobe Subway Seishin-Yamate Line',
        stations: ['谷上', '新神戸', '三宮', '県庁前', '大倉山', '湊川公園', '上沢', '長田', '新長田', '板宿', '妙法寺', '名谷', '総合運動公園', '学園都市', '伊川谷', '西神南', '西神中央'] },
      { name: '阪神本線',                       nameEn: 'Hanshin Main Line',
        stations: ['大阪梅田', '福島', '野田', '淀川', '姫島', '千船', '杭瀬', '大物', '尼崎', '出屋敷', '尼崎センタープール前', '武庫川', '鳴尾・武庫川女子大前', '甲子園', '久寿川', '今津', '西宮', '香櫨園', '打出', '芦屋', '深江', '青木', '魚崎', '住吉', '御影', '石屋川', '新在家', '大石', '西灘', '岩屋', '春日野道', '神戸三宮', '元町'] },
    ],
  },
  {
    id: 'kyoto',
    name: '京都', nameEn: 'Kyoto',
    center: { lat: 35.0116, lng: 135.7681 },
    bounds: { sw: { lat: 34.90, lng: 135.65 }, ne: { lat: 35.15, lng: 135.90 } },
    lines: [
      { name: '京都市営地下鉄烏丸線',    nameEn: 'Kyoto Subway Karasuma Line',
        stations: ['国際会館', '松ヶ崎', '北山', '北大路', '鞍馬口', '今出川', '丸太町', '烏丸御池', '四条', '五条', '京都', '九条', '十条', 'くいな橋', '竹田'] },
      { name: '京都市営地下鉄東西線',    nameEn: 'Kyoto Subway Tozai Line',
        stations: ['太秦天神川', '西大路御池', '二条', '二条城前', '烏丸御池', '京都市役所前', '三条京阪', '東山', '蹴上', '御陵', '山科', '東野', '椥辻', '小野', '醍醐', '石田', '六地蔵'] },
      { name: '阪急京都線（京都側）',    nameEn: 'Hankyu Kyoto Line (Kyoto)',
        stations: ['京都河原町', '烏丸', '大宮', '西院', '桂', '洛西口', '東向日', '西向日', '長岡天神', '西山天王山', '大山崎'] },
      { name: '京阪本線（京都側）',      nameEn: 'Keihan Main Line (Kyoto)',
        stations: ['出町柳', '神宮丸太町', '三条', '祇園四条', '清水五条', '七条', '東福寺', '鳥羽街道', '伏見稲荷', '龍谷大前深草', '藤森', '墨染', '伏見桃山', '丹波橋', '中書島'] },
    ],
  },
];

// 駅名（日本語 → 英語）の辞書。?lang=en のときの dropdown 表示に使う。
// ヘボン式 + 一般的な英語駅名表記。
export const STATION_NAMES_EN = {
  // === Tokyo: JR Yamanote / Chuo / Tokyo Metro / Toei ===
  '東京': 'Tokyo', '有楽町': 'Yurakucho', '新橋': 'Shimbashi', '浜松町': 'Hamamatsucho',
  '田町': 'Tamachi', '高輪ゲートウェイ': 'Takanawa Gateway', '品川': 'Shinagawa', '大崎': 'Osaki',
  '五反田': 'Gotanda', '目黒': 'Meguro', '恵比寿': 'Ebisu', '渋谷': 'Shibuya',
  '原宿': 'Harajuku', '代々木': 'Yoyogi', '新宿': 'Shinjuku', '新大久保': 'Shin-Okubo',
  '高田馬場': 'Takadanobaba', '目白': 'Mejiro', '池袋': 'Ikebukuro', '大塚': 'Otsuka',
  '巣鴨': 'Sugamo', '駒込': 'Komagome', '田端': 'Tabata', '西日暮里': 'Nishi-Nippori',
  '日暮里': 'Nippori', '鶯谷': 'Uguisudani', '上野': 'Ueno', '御徒町': 'Okachimachi',
  '秋葉原': 'Akihabara', '神田': 'Kanda',
  '御茶ノ水': 'Ochanomizu', '四ツ谷': 'Yotsuya', '中野': 'Nakano', '高円寺': 'Koenji',
  '阿佐ヶ谷': 'Asagaya', '荻窪': 'Ogikubo', '西荻窪': 'Nishi-Ogikubo', '吉祥寺': 'Kichijoji',
  '三鷹': 'Mitaka',
  '浅草': 'Asakusa', '田原町': 'Tawaramachi', '稲荷町': 'Inaricho', '上野広小路': 'Ueno-Hirokoji',
  '末広町': 'Suehirocho', '三越前': 'Mitsukoshimae', '日本橋': 'Nihombashi', '京橋': 'Kyobashi',
  '銀座': 'Ginza', '虎ノ門': 'Toranomon', '溜池山王': 'Tameike-Sanno', '赤坂見附': 'Akasaka-Mitsuke',
  '青山一丁目': 'Aoyama-Itchome', '外苑前': 'Gaiemmae', '表参道': 'Omote-sando',
  '茗荷谷': 'Myogadani', '後楽園': 'Korakuen', '本郷三丁目': 'Hongo-sanchome', '大手町': 'Otemachi',
  '霞ケ関': 'Kasumigaseki', '国会議事堂前': 'Kokkai-Gijidomae', '新宿御苑前': 'Shinjuku-Gyoemmae',
  '中野坂上': 'Nakano-Sakaue',
  '都庁前': 'Tochomae', '六本木': 'Roppongi', '麻布十番': 'Azabu-Juban', '汐留': 'Shiodome',
  '築地市場': 'Tsukijishijo', '門前仲町': 'Monzen-Nakacho', '清澄白河': 'Kiyosumi-Shirakawa',
  '両国': 'Ryogoku', '蔵前': 'Kuramae', '新御徒町': 'Shin-Okachimachi', '上野御徒町': 'Ueno-Okachimachi',
  '春日': 'Kasuga', '飯田橋': 'Iidabashi', '牛込神楽坂': 'Ushigome-Kagurazaka',

  // === Nagoya ===
  // 東山線
  '高畑': 'Takabata', '八田': 'Hatta', '岩塚': 'Iwatsuka', '中村公園': 'Nakamura-koen',
  '中村日赤': 'Nakamura-Nisseki', '本陣': 'Honjin', '亀島': 'Kameshima', '名古屋': 'Nagoya',
  '伏見': 'Fushimi', '栄': 'Sakae', '新栄町': 'Shin-Sakaemachi', '千種': 'Chikusa',
  '今池': 'Imaike', '池下': 'Ikeshita', '覚王山': 'Kakuozan', '本山': 'Motoyama',
  '東山公園': 'Higashiyama-koen', '星ヶ丘': 'Hoshigaoka', '一社': 'Issha', '上社': 'Kamiyashiro',
  '本郷': 'Hongo', '藤が丘': 'Fujigaoka',
  // 名城線
  'ナゴヤドーム前矢田': 'Nagoya Dome-mae Yada', '砂田橋': 'Sunadabashi', '茶屋ヶ坂': 'Chayagasaka',
  '自由ヶ丘': 'Jiyugaoka', '名古屋大学': 'Nagoya Univ.', '八事日赤': 'Yagoto-Nisseki', '八事': 'Yagoto',
  '総合リハビリセンター': 'Sogo Rehab Center', '瑞穂運動場東': 'Mizuho-undojo Higashi',
  '新瑞橋': 'Aratamabashi', '妙音通': 'Myoondori', '堀田': 'Horita', '伝馬町': 'Tenmacho',
  '神宮西': 'Jingu-nishi', '西高蔵': 'Nishi-Takakura', '金山': 'Kanayama', '東別院': 'Higashi-Betsuin',
  '上前津': 'Kami-Maezu', '矢場町': 'Yabacho', '久屋大通': 'Hisaya-odori', '市役所': 'Shiyakusho',
  '名城公園': 'Meijo-koen', '黒川': 'Kurokawa', '志賀本通': 'Shiga-hondori', '平安通': 'Heian-dori',
  '大曽根': 'Ozone',
  // 名港線
  '日比野': 'Hibino', '六番町': 'Rokubancho', '東海通': 'Tokai-dori', '港区役所': 'Minato-Kuyakusho',
  '築地口': 'Tsukijiguchi', '名古屋港': 'Nagoya-ko',
  // 上飯田線
  '上飯田': 'Kamiiida',
  // 鶴舞線
  '上小田井': 'Kami-Otai', '庄内緑地公園': 'Shonai Ryokuchi-koen', '庄内通': 'Shonai-dori',
  '浄心': 'Joshin', '浅間町': 'Sengencho', '丸の内': 'Marunouchi', '大須観音': 'Osu Kannon',
  '鶴舞': 'Tsurumai', '荒畑': 'Arahata', '御器所': 'Gokiso', '川名': 'Kawana',
  'いりなか': 'Irinaka', '塩釜口': 'Shiogamaguchi', '植田': 'Ueda', '原': 'Hara',
  '平針': 'Hirabari', '赤池': 'Akaike',
  // 桜通線
  '中村区役所': 'Nakamura-Kuyakusho', '太閤通': 'Taikodori', '国際センター': 'Kokusai Center',
  '高岳': 'Takaoka', '車道': 'Kurumamichi', '吹上': 'Fukiage', '桜山': 'Sakurayama',
  '瑞穂区役所': 'Mizuho-Kuyakusho', '瑞穂運動場西': 'Mizuho-undojo Nishi', '桜本町': 'Sakurahoncho',
  '鶴里': 'Tsurusato', '野並': 'Nonami', '徳重': 'Tokushige',
  // 名鉄名古屋本線
  '名鉄名古屋': 'Meitetsu Nagoya', '神宮前': 'Jingu-mae', '呼続': 'Yobitsugi', '本笠寺': 'Motokasadera',
  '鳴海': 'Narumi', '左京山': 'Sakyoyama', '有松': 'Arimatsu', '中京競馬場前': 'Chukyo-keibajo-mae',
  '前後': 'Zengo', '豊明': 'Toyoake', '富士松': 'Fujimatsu', '一ツ木': 'Hitotsugi',
  '知立': 'Chiryu', '東岡崎': 'Higashi-Okazaki',
  // JR中央本線
  '新守山': 'Shin-Moriyama', '勝川': 'Kachigawa', '春日井': 'Kasugai', '神領': 'Jinryo',
  '高蔵寺': 'Kozoji', '定光寺': 'Jokoji', '古虎渓': 'Kokokei', '多治見': 'Tajimi',

  // === Osaka ===
  // 御堂筋線
  '江坂': 'Esaka', '東三国': 'Higashi-Mikuni', '新大阪': 'Shin-Osaka',
  '西中島南方': 'Nishinakajima-Minamigata', '中津': 'Nakatsu', '梅田': 'Umeda',
  '淀屋橋': 'Yodoyabashi', '本町': 'Hommachi', '心斎橋': 'Shinsaibashi', 'なんば': 'Namba',
  '大国町': 'Daikokucho', '動物園前': 'Dobutsuemmae', '天王寺': 'Tennoji', '昭和町': 'Showacho',
  '西田辺': 'Nishitanabe', '長居': 'Nagai', 'あびこ': 'Abiko', '北花田': 'Kita-Hanada',
  '新金岡': 'Shin-Kanaoka', '中百舌鳥': 'Nakamozu',
  // 谷町線
  '大日': 'Dainichi', '守口': 'Moriguchi', '太子橋今市': 'Taishibashi-Imaichi',
  '千林大宮': 'Senbayashi-Omiya', '関目高殿': 'Sekime-Takadono', '野江内代': 'Noe-Uchindai',
  '都島': 'Miyakojima', '天神橋筋六丁目': 'Tenjimbashisuji-rokuchome', '中崎町': 'Nakazakicho',
  '東梅田': 'Higashi-Umeda', '南森町': 'Minamimorimachi', '天満橋': 'Temmabashi',
  '谷町四丁目': 'Tanimachi-yonchome', '谷町六丁目': 'Tanimachi-rokuchome',
  '谷町九丁目': 'Tanimachi-kyuchome', '四天王寺前夕陽ケ丘': 'Shitennoji-mae Yuhigaoka',
  '阿倍野': 'Abeno', '文の里': 'Fuminosato', '田辺': 'Tanabe', '駒川中野': 'Komagawa-Nakano',
  '平野': 'Hirano', '喜連瓜破': 'Kire-Uriwari', '出戸': 'Deto', '長原': 'Nagahara', '八尾南': 'Yaominami',
  // JR大阪環状線
  '大阪': 'Osaka', '天満': 'Temma', '桜ノ宮': 'Sakuranomiya', '京橋': 'Kyobashi',
  '大阪城公園': 'Osakajo-koen', '森ノ宮': 'Morinomiya', '玉造': 'Tamatsukuri', '鶴橋': 'Tsuruhashi',
  '桃谷': 'Momodani', '寺田町': 'Teradacho', '新今宮': 'Shin-Imamiya', '今宮': 'Imamiya',
  '芦原橋': 'Ashiharabashi', '大正': 'Taisho', '弁天町': 'Bentencho', '西九条': 'Nishikujo',
  '野田': 'Noda', '福島': 'Fukushima',
  // 阪急京都線
  '大阪梅田': 'Osaka-Umeda', '十三': 'Juso', '南方': 'Minami-kata', '崇禅寺': 'Sozenji',
  '淡路': 'Awaji', '上新庄': 'Kami-Shinjo', '相川': 'Aikawa', '正雀': 'Shojaku',
  '摂津市': 'Settsu-shi', '南茨木': 'Minami-Ibaraki', '茨木市': 'Ibaraki-shi', '富田': 'Tonda',
  '高槻市': 'Takatsuki-shi',

  // === Kobe ===
  // JR神戸線
  '尼崎': 'Amagasaki', '立花': 'Tachibana', '甲子園口': 'Koshienguchi', '西宮': 'Nishinomiya',
  'さくら夙川': 'Sakura-Shukugawa', '芦屋': 'Ashiya', '甲南山手': 'Konan-yamate',
  '摂津本山': 'Settsu-Motoyama', '住吉': 'Sumiyoshi', '六甲道': 'Rokkomichi', '灘': 'Nada',
  '三ノ宮': 'Sannomiya', '元町': 'Motomachi', '神戸': 'Kobe', '兵庫': 'Hyogo', '新長田': 'Shin-Nagata',
  '鷹取': 'Takatori', '須磨海浜公園': 'Suma-kaihinkoen', '須磨': 'Suma', '塩屋': 'Shioya',
  '垂水': 'Tarumi', '舞子': 'Maiko', '朝霧': 'Asagiri', '明石': 'Akashi',
  // 阪急神戸線
  '神崎川': 'Kanzakigawa', '園田': 'Sonoda', '塚口': 'Tsukaguchi', '武庫之荘': 'Mukonoso',
  '西宮北口': 'Nishinomiya-kitaguchi', '夙川': 'Shukugawa', '芦屋川': 'Ashiyagawa',
  '岡本': 'Okamoto', '御影': 'Mikage', '六甲': 'Rokko', '王子公園': 'Oji-koen',
  '春日野道': 'Kasuganomichi', '神戸三宮': 'Kobe-Sannomiya',
  // 神戸市営地下鉄
  '谷上': 'Tanigami', '新神戸': 'Shin-Kobe', '三宮': 'Sannomiya', '県庁前': 'Kenchomae',
  '大倉山': 'Okurayama', '湊川公園': 'Minatogawa-koen', '上沢': 'Kamisawa', '長田': 'Nagata',
  '板宿': 'Itayado', '妙法寺': 'Myohoji', '名谷': 'Myodani', '総合運動公園': 'Sogo-undokoen',
  '学園都市': 'Gakuentoshi', '伊川谷': 'Ikawadani', '西神南': 'Seishin-minami', '西神中央': 'Seishin-chuo',
  // 阪神本線
  '淀川': 'Yodogawa', '姫島': 'Himejima', '千船': 'Chibune', '杭瀬': 'Kuise', '大物': 'Daimotsu',
  '出屋敷': 'Deyashiki', '尼崎センタープール前': 'Amagasaki Center Pool-mae', '武庫川': 'Mukogawa',
  '鳴尾・武庫川女子大前': 'Naruo-Mukogawajoshidai-mae', '甲子園': 'Koshien', '久寿川': 'Kusugawa',
  '今津': 'Imazu', '香櫨園': 'Koroen', '打出': 'Uchide', '深江': 'Fukae', '青木': 'Ogi',
  '魚崎': 'Uozaki', '石屋川': 'Ishiyagawa', '新在家': 'Shin-Zaike', '大石': 'Oishi',
  '西灘': 'Nishi-Nada', '岩屋': 'Iwaya',

  // === Kyoto ===
  // 烏丸線
  '国際会館': 'Kokusaikaikan', '松ヶ崎': 'Matsugasaki', '北山': 'Kitayama', '北大路': 'Kitaoji',
  '鞍馬口': 'Kuramaguchi', '今出川': 'Imadegawa', '丸太町': 'Marutamachi', '烏丸御池': 'Karasuma-Oike',
  '四条': 'Shijo', '五条': 'Gojo', '京都': 'Kyoto', '九条': 'Kujo', '十条': 'Jujo',
  'くいな橋': 'Kuinabashi', '竹田': 'Takeda',
  // 東西線
  '太秦天神川': 'Uzumasa-Tenjingawa', '西大路御池': 'Nishioji-Oike', '二条': 'Nijo',
  '二条城前': 'Nijojo-mae', '京都市役所前': 'Kyoto-Shiyakushomae', '三条京阪': 'Sanjo-Keihan',
  '東山': 'Higashiyama', '蹴上': 'Keage', '御陵': 'Misasagi', '山科': 'Yamashina',
  '東野': 'Higashino', '椥辻': 'Nagitsuji', '小野': 'Ono', '醍醐': 'Daigo',
  '石田': 'Ishida', '六地蔵': 'Rokujizo',
  // 阪急京都線（京都側）
  '京都河原町': 'Kyoto-Kawaramachi', '烏丸': 'Karasuma', '大宮': 'Omiya', '西院': 'Saiin',
  '桂': 'Katsura', '洛西口': 'Rakusaiguchi', '東向日': 'Higashi-Muko', '西向日': 'Nishi-Muko',
  '長岡天神': 'Nagaoka-Tenjin', '西山天王山': 'Nishiyama-Tennozan', '大山崎': 'Oyamazaki',
  // 京阪本線（京都側）
  '出町柳': 'Demachiyanagi', '神宮丸太町': 'Jingu-Marutamachi', '三条': 'Sanjo', '祇園四条': 'Gion-Shijo',
  '清水五条': 'Kiyomizu-Gojo', '七条': 'Shichijo', '東福寺': 'Tofukuji', '鳥羽街道': 'Tobakaido',
  '伏見稲荷': 'Fushimi-Inari', '龍谷大前深草': 'Ryukokudaimae-Fukakusa', '藤森': 'Fujinomori',
  '墨染': 'Sumizome', '伏見桃山': 'Fushimi-Momoyama', '丹波橋': 'Tamba-bashi', '中書島': 'Chushojima',
};

// 駅名を現在の言語で返すヘルパー
//   en: 辞書にあれば英訳、無ければそのまま日本語
//   ja / elementary: 日本語のまま
export function localizeStationName(jaName, lang) {
  if (lang === 'en' && STATION_NAMES_EN[jaName]) return STATION_NAMES_EN[jaName];
  return jaName;
}
