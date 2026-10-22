import type { CultureGroup } from '../game/types';

// Name pools for generated ministers, generals and heirs. For cultures where inventing
// personal names risks misrepresentation, generated characters are identified by office.

interface Pool { m: string[]; f: string[]; s: string[]; order?: 'family-first' | 'single' }

const P = (m: string, f: string, s: string, order?: Pool['order']): Pool => ({ m: m.split(','), f: f.split(','), s: s ? s.split(',') : [], order });

export const NAME_POOLS: Partial<Record<CultureGroup, Pool>> = {
  british: P('William,John,George,Henry,Charles,Thomas,Robert,Edward,James,Arthur,Richard,Frederick', 'Mary,Charlotte,Elizabeth,Anne,Caroline,Sophia,Amelia', 'Grenville,Dundas,Moore,Hastings,Cavendish,Pelham,Spencer,Howe,Graham,Murray,Campbell,Fitzroy,Wellesley,Abercromby,Elliot'),
  french: P('Jean,Louis,Pierre,Joseph,Jacques,Michel,Charles,Nicolas,Étienne,Antoine,Claude,Joachim', 'Marie,Joséphine,Thérèse,Louise,Hortense,Pauline', 'Moreau,Lefebvre,Berthier,Duroc,Lannes,Soult,Davout,Marmont,Clarke,Talleyrand,Fouché,Daru,Cambacérès,Lebrun,Gaudin'),
  german: P('Friedrich,Karl,Wilhelm,Ludwig,Johann,Heinrich,Ernst,Georg,August,Maximilian,Otto,Christian', 'Luise,Charlotte,Sophie,Wilhelmine,Amalie,Caroline', 'von Stein,von Hardenberg,von Blücher,von Scharnhorst,von Gneisenau,von Bülow,von Kleist,von Yorck,von Schwarzenberg,von Kray,von Mack,von Metternich,von Stadion,von Thugut'),
  dutch: P('Willem,Jan,Pieter,Hendrik,Cornelis,Rutger,Gijsbert,Herman,Isaac,Daendels', 'Anna,Maria,Wilhelmina,Johanna,Catharina', 'van Hogendorp,Schimmelpenninck,Daendels,Dumonceau,van Hooff,de Winter,Gogel,Verhuell,van Maanen,Janssens'),
  iberian: P('Carlos,José,Manuel,Francisco,Pedro,Juan,Antonio,Fernando,Luis,Miguel,Joaquim,João', 'María,Teresa,Isabel,Carlota,Josefa,Ana', 'de Godoy,de Urquijo,de Saavedra,de Cevallos,Gravina,Castaños,Palafox,de Souza,Pombal,de Almeida,Mendizábal,de Vasconcelos,de Mello'),
  italian: P('Giuseppe,Carlo,Francesco,Giovanni,Luigi,Ferdinando,Pietro,Antonio,Vittorio,Ercole', 'Maria,Teresa,Carolina,Luisa,Beatrice,Elena', 'Acton,Consalvi,Ruffo,di Revel,Litta,Medici,Caracciolo,Corsini,Serbelloni,Melzi,Pignatelli,di Savoia'),
  nordic: P('Gustav,Carl,Fredrik,Johan,Christian,Peder,Niels,Axel,Erik,Ole', 'Ulrika,Charlotta,Sophia,Ingrid,Marie', 'Adlercreutz,Armfelt,Toll,Bernstorff,Schimmelmann,Reventlow,Wachtmeister,Stedingk,Klingspor,Hauch'),
  slavic: P('Alexander,Nikolai,Mikhail,Pyotr,Ivan,Sergei,Dmitri,Fyodor,Pavel,Andrei,Józef,Tadeusz', 'Ekaterina,Maria,Anna,Elizaveta,Natalya,Olga', 'Kutuzov,Bagration,Barclay,Rostopchin,Kochubey,Stroganov,Czartoryski,Panin,Speransky,Arakcheyev,Volkonsky,Golitsyn,Chichagov,Tormasov'),
  hungarian: P('István,Ferenc,József,János,Miklós,Pál,László', 'Erzsébet,Mária,Katalin,Anna', 'Esterházy,Pálffy,Széchényi,Batthyány,Zichy,Andrássy,Festetics'),
  greek: P('Ioannis,Konstantinos,Alexandros,Georgios,Dimitrios,Nikolaos,Theodoros,Ali,Veli,Muhtar', 'Eleni,Maria,Vasiliki,Sophia', 'Kapodistrias,Mavrokordatos,Ypsilantis,Soutzos,Karatzas,Kolokotronis,Botsaris,Tepelena'),
  turkic: P('Mehmed,Mustafa,Ahmed,Selim,Mahmud,Halil,Hüseyin,Yusuf,Osman,İbrahim,Abdullah,Ali', 'Ayşe,Fatma,Hatice,Esma,Mihrişah,Zeynep', 'Pasha,Efendi,Ağa,Bey,Çelebi', 'single'),
  persian: P('Mirza Abul Hassan,Mirza Shafi,Hajji Ibrahim,Mohammad Hossein,Abbas,Hossein Qoli,Mohammad Ali,Ali Qoli,Fath Ali,Mirza Bozorg', 'Asiyeh,Khadijeh,Fatemeh,Maryam', 'Khan,Mirza,Shirazi,Esfahani,Qajar,Qa\'em-Maqam', 'single'),
  arab: P('Abdullah,Muhammad,Ahmad,Ali,Hasan,Husayn,Umar,Sulayman,Saud,Faisal,Turki,Hamad', 'Fatima,Aisha,Maryam,Nura,Khadija', 'ibn Saud,al-Hashimi,al-Kabir,ibn Rashid,al-Qasimi,ibn Ahmad,al-Mazrui,ibn Sultan', 'single'),
  afghan: P('Fateh Khan,Dost Mohammad,Sher Mohammad,Wafadar Khan,Mukhtar,Ata Mohammad,Azim Khan,Payinda Khan', 'Zarghuna,Malalai,Nazo', 'Barakzai,Popalzai,Sadozai,Alikozai,Durrani', 'single'),
  south_asian: P('Raghunath,Madhav,Mahadji,Tukoji,Govind,Sadashiv,Bajirao,Ramchandra,Krishna,Vithoji,Mir Alam,Purnaiah,Ram Singh,Ganga Dhar,Anand Rao', 'Ahilyabai,Lakshmibai,Tarabai,Jamnabai,Rajkunwar', 'Phadnavis,Patwardhan,Peshwe,Gokhale,Rastia,Bhau,Khan,Rao,Pant,Singh', 'single'),
  sikh: P('Hari Singh,Fateh Singh,Diwan Chand,Mokham Chand,Jodh Singh,Dal Singh,Gurmukh Singh,Phula Singh,Baghel Singh,Kharak Singh,Sher Singh,Tara Singh,Ajit Singh,Attar Singh', 'Sada Kaur,Mehtab Kaur,Datar Kaur,Raj Kaur,Jind Kaur,Chand Kaur,Rattan Kaur,Daya Kaur,Desan Kaur', 'Nalwa,Ahluwalia,Kanhaiya,Ramgarhia,Bhangi,Majithia,Sandhawalia,Attariwala', 'single'),
  himalayan: P('Bhimsen,Damodar,Kirtiman,Ranajit,Amar Singh,Bahadur,Tenzin,Sonam,Karma,Tashi', 'Rajrajeshwari,Tripurasundari,Pema,Dolma', 'Thapa,Pande,Basnyat,Shah,Namgyal,Dorji', 'single'),
  chinese: P('Heshen,Agui,Fukang\'an,Elengtai,Delengtai,Changling,Nayancheng,Song Yun,Liu Yong,Wang Jie,Dong Gao,Zhu Gui', 'Xiaoshu,Hualan,Yuying', 'Niohuru,Gūwalgiya,Wanyan,Liu,Wang,Zhang,Li,Chen,Zhu,Dong', 'single'),
  mongol: P('Tsedendorj,Sundodorj,Lubsangdandzan,Yondondorj,Galsang,Damdin', 'Oyun,Narantsetseg', 'Borjigin,Khalkha', 'single'),
  korean: P('Chae Je-gong,Kim Jo-sun,Jeong Yak-yong,Pak Che-ga,Yi Gyeong-il,Sim Hwan-ji,Kim Gwan-ju,Seo Yong-bo,Yi Byeong-mo,Han Yong-gu', 'Hyegyeong,Jeongsun,Hyoui', '', 'single'),
  japanese: P('Matsudaira Sadanobu,Tanuma Okitsugu,Mamiya Rinzō,Mogami Tokunai,Kondō Jūzō,Ōtsuki Gentaku,Honda Toshiaki,Hayashi Shihei,Matsudaira Nobuakira,Toda Ujinori', 'Hiroko,Takako,Ayako', '', 'single'),
  vietnamese: P('Lê Văn Duyệt,Võ Tánh,Nguyễn Văn Thành,Trịnh Hoài Đức,Lê Chất,Trần Quang Diệu,Võ Văn Dũng,Bùi Thị Xuân,Ngô Thì Nhậm,Phan Huy Ích', 'Bùi Thị Xuân,Ngọc Hân,Ngọc Bình', '', 'single'),
  tai: P('Chaophraya Chakri,Phraya Phrakhlang,Bunnak,Thongduang,Inthavong,Anouvong,Sundhorn,Pin,Ruang', 'Srisuriyendra,Chim,Nuan', '', 'single'),
  burmese: P('Maha Bandula,Minhla Thiri,Thado Mindin,Letwe Nawrahta,Myawaddy,Maha Thiha Thura,Mingyi Kyaw', 'Me Nu,Shin Bo Me', '', 'single'),
  malay: P('Raja Haji,Raja Ali,Tengku Long,Tengku Abdul Rahman,Daeng Kemboja,Bendahara Abdul Majid,Temenggung Abdul Rahman,Panglima Polem,Sutan Muda', 'Engku Puteri Hamidah,Tengku Hamidah,Ratu Ayu', '', 'single'),
  ethiopian: P('Wolde Gabriel,Gugsa,Haile Maryam,Mikael,Tewodros,Yohannes,Wolde Selassie,Gebre Medhin', 'Mentewab,Walatta Giyorgis,Menen', '', 'single'),
  west_african: P('Kwame,Kofi,Yaw,Kwaku,Opoku,Adinkra,Ajayi,Adebayo,Ogunmola,Bello,Musa,Sundiata,Mamadou,Ousmane', 'Yaa,Afua,Akosua,Amina,Efunroye', 'Frimpong,Asamoa,Boakye,Agyeman,Ogundipe,Adeyemi,Diallo,Touré,Coulibaly,Keita,Sow', 'single'),
  sahelian: P('Muhammad Bello,Abdullahi,Uthman,Ibrahim,Yaqub,Abubakar,Umar,Ali Dinar,Tahir', 'Nana Asma\'u,Amina,Hauwa', '', 'single'),
  bantu: P('Mwanga,Kiwanuka,Nsibirwa,Nyungu,Lukwesa,Mulambwa,Sekeletu,Ndlambe,Makana,Hintsa,Mzilikazi,Sebetwane', 'Nandi,Mmanthatisi,Nyamakeda', '', 'single'),
  swahili: P('Mbaruk,Salim,Rashid,Abdallah,Mwinyi,Said,Khamis,Hamad', 'Mwana Kupona,Fatuma,Mwanamisi', 'al-Mazrui,bin Ahmad,bin Salim', 'single'),
  malagasy: P('Rainimaharo,Andriantsalama,Ramanetaka,Rainiharo,Andriamihaja,Ratefy', 'Ranavalona,Rasoherina,Rabodo', '', 'single'),
  american: P('James,Thomas,Alexander,Albert,Henry,John,Timothy,Oliver,Charles,Benjamin,Samuel,Rufus', 'Abigail,Dolley,Martha,Elizabeth,Sarah', 'Hamilton,Gallatin,Pickering,Wolcott,Stoddert,Knox,Pinckney,King,Ames,Dearborn,Wilkinson,Truxtun,Decatur,Preble'),
  latin_american: P('José,Juan,Manuel,Francisco,Antonio,Miguel,Agustín,Ignacio,Mariano,Bernardo', 'María,Josefa,Manuela,Leona,Juana', 'de Iturrigaray,Hidalgo,Allende,Liniers,de Elío,Abascal,Sobremonte,Belgrano,Nariño,Miranda,del Pino,Venegas'),
  caucasian: P('Ioane,Davit,Erekle,Solomon,Tamaz,Giorgi,Aleksandre,Javad,Ibrahim,Mustafa', 'Darejan,Mariam,Tamar,Ketevan', 'Bagrationi,Orbeliani,Tsitsishvili,Chavchavadze,Dadiani,Khan', 'single'),
  central_asian: P('Haydar,Nasrullah,Muhammad Rahim,Umar,Madali,Ablai,Kenesary,Syrym,Qasim', 'Nadira,Uvaysi,Aysha', 'Khan,Bek,Biy,Tore,Inaq', 'single'),
};

/** Titled offices for societies where generated personal names are inappropriate. */
export const OFFICE_TITLES: Record<string, string> = {
  finance: 'Keeper of the Common Stores',
  foreign: 'Speaker to Other Nations',
  military: 'War Leader',
  admin: 'Council Elder',
  intelligence: 'Scout Captain',
  general: 'War Leader',
  heir: 'Designated Successor',
  admiral: 'Canoe Fleet Leader',
};
