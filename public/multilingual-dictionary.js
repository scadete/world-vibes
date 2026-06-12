// Multilingual news-domain word equivalency dictionary.
// Used by cluster-dictionary-worker.js as a translation-aware similarity backbone.
//
// Each entry is one canonical concept. Tokens encountered during article
// tokenization that match any of the per-language strings collapse to that
// concept's id, so an English "war" and a Russian "война" become the same
// token in the similarity computation.
//
// Languages covered (matches the news sources in feeds.js plus likely future
// expansion): English, Portuguese, Spanish, Russian, Japanese, Chinese.
// All term arrays are LOWERCASED, ACCENT-STRIPPED in the same way the worker
// normalises article text — see cluster-dictionary-worker.js:normalize().

export const CONCEPTS = [
  // ── geopolitics & conflict ───────────────────────────────────────────────
  { id: 'war',         en: ['war','warfare','conflict'], pt: ['guerra','conflito'],         es: ['guerra','conflicto'],         ru: ['война','войны','войну','войне'], ja: ['戦争','戦闘'],            zh: ['战争','戰爭','战事'] },
  { id: 'ceasefire',   en: ['ceasefire','truce'],         pt: ['cessar','tregua','armisticio'], es: ['alto','tregua','armisticio'], ru: ['перемирие'],                       ja: ['停戦','休戦'],            zh: ['停火','停戰','休战'] },
  { id: 'peace',       en: ['peace','peacekeeping'],      pt: ['paz'],                         es: ['paz'],                        ru: ['мир','мира'],                      ja: ['平和'],                  zh: ['和平'] },
  { id: 'attack',      en: ['attack','strike','assault'], pt: ['ataque','ataques','ofensiva'], es: ['ataque','ataques','ofensiva'], ru: ['атака','удар','нападение'],       ja: ['攻撃','襲撃'],            zh: ['攻击','袭击','攻擊','襲擊'] },
  { id: 'invasion',    en: ['invasion','invade'],         pt: ['invasao','invadir'],            es: ['invasion','invadir'],         ru: ['вторжение','оккупация'],          ja: ['侵攻','侵略'],            zh: ['入侵','侵略'] },
  { id: 'missile',     en: ['missile','rocket','drone'],  pt: ['missil','misseis','foguete','drone'], es: ['misil','misiles','cohete','drone'], ru: ['ракета','ракеты','дрон','бпла'], ja: ['ミサイル','ロケット','ドローン'], zh: ['导弹','飞弹','无人机','飛彈','無人機'] },
  { id: 'bomb',        en: ['bomb','bombing','explosion'], pt: ['bomba','bombardeio','explosao'], es: ['bomba','bombardeo','explosion'], ru: ['бомба','взрыв','теракт'],     ja: ['爆弾','爆発','爆撃'],     zh: ['炸弹','爆炸','轰炸','炸彈','轟炸'] },
  { id: 'soldier',     en: ['soldier','troop','troops'],  pt: ['soldado','soldados','tropas'],  es: ['soldado','soldados','tropas'], ru: ['солдат','войска'],                ja: ['兵士','部隊','軍人'],     zh: ['士兵','军人','部队','軍人','部隊'] },
  { id: 'army',        en: ['army','military','forces'],  pt: ['exercito','militar','militares','forcas'], es: ['ejercito','militar','militares','fuerzas'], ru: ['армия','военные','вооружённые'], ja: ['軍','軍隊','陸軍'],     zh: ['军队','军方','陸軍','軍隊'] },
  { id: 'navy',        en: ['navy','naval','fleet'],      pt: ['marinha','naval','frota'],      es: ['armada','naval','flota'],     ru: ['флот','военно','морской'],        ja: ['海軍','艦隊'],            zh: ['海军','海軍','舰队','艦隊'] },
  { id: 'airforce',    en: ['airforce','airstrike'],      pt: ['aerea','aereo','aviacao'],      es: ['aerea','aereo','aviacion'],   ru: ['ввс','авиация','авиаудар'],       ja: ['空軍','空爆'],            zh: ['空军','空袭','空軍','空襲'] },
  { id: 'weapon',      en: ['weapon','arms','arsenal'],   pt: ['arma','armas','armamento'],     es: ['arma','armas','armamento'],   ru: ['оружие','вооружение'],            ja: ['兵器','武器'],            zh: ['武器','军火','軍火'] },
  { id: 'nuclear',     en: ['nuclear','atomic'],          pt: ['nuclear','atomico'],            es: ['nuclear','atomico'],          ru: ['ядерный','ядерное'],              ja: ['核','原子力'],            zh: ['核','核子'] },
  { id: 'terrorism',   en: ['terrorism','terrorist'],     pt: ['terrorismo','terrorista'],      es: ['terrorismo','terrorista'],    ru: ['терроризм','террорист'],          ja: ['テロ','テロリスト'],      zh: ['恐怖主义','恐怖分子','恐怖主義'] },
  { id: 'hostage',     en: ['hostage','captive'],         pt: ['refem','refens'],               es: ['rehen','rehenes'],            ru: ['заложник','заложники'],          ja: ['人質'],                  zh: ['人质','人質'] },
  { id: 'refugee',     en: ['refugee','refugees','migrant','migrants'], pt: ['refugiado','refugiados','migrante','migrantes'], es: ['refugiado','refugiados','migrante','migrantes'], ru: ['беженец','беженцы','мигрант','мигранты'], ja: ['難民','移民'],          zh: ['难民','移民','難民'] },
  { id: 'genocide',    en: ['genocide'],                  pt: ['genocidio'],                   es: ['genocidio'],                  ru: ['геноцид'],                        ja: ['ジェノサイド','大虐殺'],  zh: ['种族灭绝','種族滅絕'] },

  // ── politics & diplomacy ─────────────────────────────────────────────────
  { id: 'election',    en: ['election','elections','vote','voting'], pt: ['eleicao','eleicoes','voto','votacao'], es: ['eleccion','elecciones','voto','votacion'], ru: ['выборы','голосование'], ja: ['選挙','投票'],          zh: ['选举','选民','投票','選舉','選民'] },
  { id: 'president',   en: ['president','presidential'],  pt: ['presidente','presidencial'],    es: ['presidente','presidencial'], ru: ['президент'],                     ja: ['大統領'],                zh: ['总统','總統'] },
  { id: 'prime_min',   en: ['premier','minister'],        pt: ['primeiro','ministro'],          es: ['primer','ministro'],         ru: ['премьер','министр'],             ja: ['首相','大臣'],            zh: ['首相','总理','總理'] },
  { id: 'government',  en: ['government','administration'], pt: ['governo','administracao'],    es: ['gobierno','administracion'], ru: ['правительство','администрация'], ja: ['政府','政権'],            zh: ['政府','政权','政權'] },
  { id: 'parliament',  en: ['parliament','congress','senate'], pt: ['parlamento','congresso','senado'], es: ['parlamento','congreso','senado'], ru: ['парламент','конгресс','сенат'], ja: ['議会','国会','上院'],   zh: ['议会','国会','参议院','議會','國會'] },
  { id: 'court',       en: ['court','judge','judicial','justice'], pt: ['tribunal','juiz','judicial','justica'], es: ['tribunal','juez','judicial','justicia'], ru: ['суд','судья'],          ja: ['裁判所','裁判官'],        zh: ['法院','法官'] },
  { id: 'law',         en: ['law','legal','legislation'], pt: ['lei','leis','legal','legislacao'], es: ['ley','leyes','legal','legislacion'], ru: ['закон','законы','законопроект'], ja: ['法律','法案'],        zh: ['法律','法案'] },
  { id: 'protest',     en: ['protest','protests','demonstration','rally'], pt: ['protesto','manifestacao','manifestacoes'], es: ['protesta','manifestacion','manifestaciones'], ru: ['протест','демонстрация','митинг'], ja: ['抗議','デモ'],         zh: ['抗议','示威','抗議'] },
  { id: 'sanction',    en: ['sanction','sanctions','embargo'], pt: ['sancao','sancoes','embargo'], es: ['sancion','sanciones','embargo'], ru: ['санкции','эмбарго'],            ja: ['制裁','禁輸'],            zh: ['制裁','禁运','禁運'] },
  { id: 'treaty',      en: ['treaty','accord','pact','agreement'], pt: ['tratado','acordo','pacto'], es: ['tratado','acuerdo','pacto'], ru: ['договор','соглашение','пакт'],   ja: ['条約','協定'],            zh: ['条约','协议','條約','協議'] },
  { id: 'diplomacy',   en: ['diplomacy','diplomat','diplomatic'], pt: ['diplomacia','diplomata','diplomatico'], es: ['diplomacia','diplomatico'], ru: ['дипломатия','дипломат'],     ja: ['外交','外交官'],          zh: ['外交','外交官'] },
  { id: 'summit',      en: ['summit'],                    pt: ['cimeira','cupula'],             es: ['cumbre'],                     ru: ['саммит'],                        ja: ['首脳会談','サミット'],    zh: ['峰会','峰會'] },
  { id: 'unitednations', en: ['un','united','nations','unsc'], pt: ['onu','nacoes','unidas'],   es: ['onu','naciones','unidas'],    ru: ['оон'],                            ja: ['国連','国際連合'],        zh: ['联合国','聯合國'] },
  { id: 'nato',        en: ['nato'],                      pt: ['otan'],                         es: ['otan'],                       ru: ['нато'],                           ja: ['nato','北大西洋条約'],     zh: ['北约','北約'] },
  { id: 'eu',          en: ['eu','european','union'],     pt: ['ue','europeia','europeu','uniao'], es: ['ue','europea','europeo','union'], ru: ['ес','европейский','евросоюз'], ja: ['eu','欧州連合'],        zh: ['欧盟','歐盟'] },

  // ── economics & finance ──────────────────────────────────────────────────
  { id: 'economy',     en: ['economy','economic'],        pt: ['economia','economico'],         es: ['economia','economico'],       ru: ['экономика','экономический'],     ja: ['経済'],                  zh: ['经济','經濟'] },
  { id: 'inflation',   en: ['inflation'],                 pt: ['inflacao'],                    es: ['inflacion'],                  ru: ['инфляция'],                       ja: ['インフレ','物価上昇'],    zh: ['通胀','通货膨胀','通脹'] },
  { id: 'recession',   en: ['recession','downturn'],      pt: ['recessao'],                    es: ['recesion'],                   ru: ['рецессия','спад'],                ja: ['景気後退','不況'],        zh: ['衰退','经济衰退','衰退'] },
  { id: 'gdp',         en: ['gdp'],                       pt: ['pib'],                          es: ['pib'],                        ru: ['ввп'],                            ja: ['gdp','国内総生産'],       zh: ['gdp','国内生产总值','國內生產總值'] },
  { id: 'tax',         en: ['tax','taxes','tariff','tariffs'], pt: ['imposto','impostos','tarifa','tarifas'], es: ['impuesto','impuestos','arancel','aranceles'], ru: ['налог','налоги','тариф'], ja: ['税','関税'],         zh: ['税','关税','稅','關稅'] },
  { id: 'currency',    en: ['currency','dollar','euro','yuan','yen','ruble','real'], pt: ['moeda','dolar','euro','yuan','iene','rublo','real'], es: ['moneda','dolar','euro','yuan','yen','rublo','real'], ru: ['валюта','доллар','евро','юань','иена','рубль'], ja: ['通貨','ドル','ユーロ','元','円','ルーブル'], zh: ['货币','美元','欧元','人民币','日元','貨幣','歐元','人民幣'] },
  { id: 'market',      en: ['market','markets','stock','stocks','shares'], pt: ['mercado','mercados','bolsa','acoes'], es: ['mercado','mercados','bolsa','acciones'], ru: ['рынок','рынки','биржа','акции'], ja: ['市場','株式','株価'], zh: ['市场','股市','股票','市場'] },
  { id: 'bank',        en: ['bank','banks','banking'],    pt: ['banco','bancos','bancario'],    es: ['banco','bancos','bancario'],  ru: ['банк','банки','банковский'],     ja: ['銀行'],                  zh: ['银行','銀行'] },
  { id: 'oil',         en: ['oil','crude','petroleum'],   pt: ['petroleo','crude'],             es: ['petroleo','crudo'],           ru: ['нефть','нефтяной'],              ja: ['石油','原油'],            zh: ['石油','原油'] },
  { id: 'gas',         en: ['gas','natural'],             pt: ['gas','natural'],                es: ['gas','natural'],              ru: ['газ','газовый'],                 ja: ['ガス','天然ガス'],        zh: ['天然气','天然氣'] },
  { id: 'energy',      en: ['energy','power','electricity'], pt: ['energia','eletrica','eletricidade'], es: ['energia','electrica','electricidad'], ru: ['энергия','электричество'], ja: ['エネルギー','電力'],     zh: ['能源','电力','電力'] },
  { id: 'trade',       en: ['trade','export','exports','import','imports'], pt: ['comercio','exportacao','exportacoes','importacao','importacoes'], es: ['comercio','exportacion','exportaciones','importacion','importaciones'], ru: ['торговля','экспорт','импорт'], ja: ['貿易','輸出','輸入'], zh: ['贸易','出口','进口','貿易','進口'] },

  // ── disasters / weather / health ─────────────────────────────────────────
  { id: 'earthquake',  en: ['earthquake','quake'],        pt: ['terremoto','tremor','sismo'],   es: ['terremoto','sismo','temblor'], ru: ['землетрясение'],                 ja: ['地震'],                  zh: ['地震'] },
  { id: 'tsunami',     en: ['tsunami'],                   pt: ['tsunami'],                      es: ['tsunami','maremoto'],         ru: ['цунами'],                         ja: ['津波'],                  zh: ['海啸','海嘯'] },
  { id: 'hurricane',   en: ['hurricane','typhoon','cyclone'], pt: ['furacao','tufao','ciclone'], es: ['huracan','tifon','ciclon'],  ru: ['ураган','тайфун','циклон'],      ja: ['ハリケーン','台風','サイクロン'], zh: ['飓风','台风','飓風','颱風'] },
  { id: 'flood',       en: ['flood','flooding','floods'], pt: ['inundacao','enchente','cheia'], es: ['inundacion','inundaciones'],  ru: ['наводнение','паводок'],          ja: ['洪水','水害'],            zh: ['洪水','洪災'] },
  { id: 'wildfire',    en: ['wildfire','wildfires','fire','blaze'], pt: ['incendio','incendios','queimada','queimadas'], es: ['incendio','incendios'], ru: ['пожар','пожары'],     ja: ['山火事','火災'],          zh: ['野火','大火','火灾','火災'] },
  { id: 'drought',     en: ['drought'],                   pt: ['seca'],                         es: ['sequia'],                     ru: ['засуха'],                         ja: ['干ばつ','旱魃'],          zh: ['干旱','旱災','乾旱'] },
  { id: 'storm',       en: ['storm','tornado'],           pt: ['tempestade','tornado'],         es: ['tormenta','tornado'],         ru: ['шторм','буря','торнадо'],        ja: ['嵐','暴風','トルネード'], zh: ['风暴','龙卷风','暴風','龍捲風'] },
  { id: 'volcano',     en: ['volcano','eruption','volcanic'], pt: ['vulcao','erupcao','vulcanico'], es: ['volcan','erupcion','volcanico'], ru: ['вулкан','извержение'],   ja: ['火山','噴火'],            zh: ['火山','喷发','噴發'] },
  { id: 'climate',     en: ['climate','warming'],         pt: ['clima','climatico','aquecimento'], es: ['clima','climatico','calentamiento'], ru: ['климат','потепление'],   ja: ['気候','温暖化'],          zh: ['气候','气候变化','氣候','變暖'] },
  { id: 'pandemic',    en: ['pandemic','epidemic','outbreak'], pt: ['pandemia','epidemia','surto'], es: ['pandemia','epidemia','brote'], ru: ['пандемия','эпидемия','вспышка'], ja: ['パンデミック','流行'], zh: ['大流行','疫情'] },
  { id: 'virus',       en: ['virus','viral','covid','coronavirus','flu','influenza'], pt: ['virus','viral','covid','coronavirus','gripe'], es: ['virus','viral','covid','coronavirus','gripe'], ru: ['вирус','ковид','коронавирус','грипп'], ja: ['ウイルス','コロナ','インフルエンザ'], zh: ['病毒','新冠','流感'] },
  { id: 'vaccine',     en: ['vaccine','vaccines','vaccination'], pt: ['vacina','vacinas','vacinacao'], es: ['vacuna','vacunas','vacunacion'], ru: ['вакцина','вакцинация'],     ja: ['ワクチン','接種'],        zh: ['疫苗','接种','接種'] },
  { id: 'health',      en: ['health','medical','medicine'], pt: ['saude','medico','medicina'],  es: ['salud','medico','medicina'],  ru: ['здоровье','медицина','медицинский'], ja: ['健康','医療'],         zh: ['健康','医疗','醫療'] },
  { id: 'hospital',    en: ['hospital','hospitals','clinic'], pt: ['hospital','hospitais','clinica'], es: ['hospital','hospitales','clinica'], ru: ['больница','клиника'],      ja: ['病院','診療所'],          zh: ['医院','診所','醫院'] },
  { id: 'death',       en: ['death','deaths','killed','died','fatalities','casualties'], pt: ['morte','mortes','morto','mortos','vitimas','baixas'], es: ['muerte','muertes','muerto','muertos','victimas','bajas'], ru: ['смерть','смерти','погиб','погибли','жертвы'], ja: ['死亡','死者','犠牲者'], zh: ['死亡','死者','遇难','遇難'] },
  { id: 'injured',     en: ['injured','wounded'],         pt: ['ferido','feridos'],             es: ['herido','heridos'],           ru: ['раненые','раненых','пострадавшие'], ja: ['負傷','負傷者'],       zh: ['受伤','伤者','傷者','受傷'] },

  // ── crime / civil unrest ─────────────────────────────────────────────────
  { id: 'crime',       en: ['crime','criminal'],          pt: ['crime','criminoso','criminosa'], es: ['crimen','criminal'],         ru: ['преступление','преступный'],     ja: ['犯罪'],                  zh: ['犯罪','罪犯'] },
  { id: 'police',      en: ['police','officer','officers'], pt: ['policia','policial','policiais'], es: ['policia','policial','policiales'], ru: ['полиция','полицейский'],   ja: ['警察','警官'],            zh: ['警察','警員','警员'] },
  { id: 'arrest',      en: ['arrest','arrested','detained','detention'], pt: ['preso','presa','detido','detida','prisao'], es: ['detenido','detencion','arresto'], ru: ['арест','задержан','арестован'], ja: ['逮捕','拘束'],     zh: ['逮捕','拘留','拘捕'] },
  { id: 'shooting',    en: ['shooting','gunman','shot','shots'], pt: ['tiroteio','atirador'],   es: ['tiroteo','tirador'],          ru: ['стрельба','стрелок'],            ja: ['銃撃','発砲'],            zh: ['枪击','槍擊','开枪','開槍'] },
  { id: 'corruption',  en: ['corruption','bribery'],      pt: ['corrupcao','suborno'],          es: ['corrupcion','soborno'],       ru: ['коррупция','взятка'],            ja: ['汚職','贈賄'],            zh: ['腐败','贪污','貪污','腐敗'] },

  // ── technology / AI / quantum ────────────────────────────────────────────
  { id: 'ai',          en: ['ai','artificial','intelligence'], pt: ['ia','artificial','inteligencia'], es: ['ia','artificial','inteligencia'], ru: ['ии','искусственный','интеллект'], ja: ['ai','人工知能'], zh: ['ai','人工智能','人工智慧'] },
  { id: 'machinelrn',  en: ['machine','learning','ml'],   pt: ['aprendizado','maquina'],        es: ['aprendizaje','automatico'],   ru: ['машинное','обучение'],           ja: ['機械学習'],              zh: ['机器学习','機器學習'] },
  { id: 'llm',         en: ['llm','llms','chatbot','gpt'], pt: ['llm','chatbot'],               es: ['llm','chatbot'],              ru: ['llm','чатбот'],                  ja: ['llm','チャットボット'],   zh: ['llm','聊天机器人','聊天機器人'] },
  { id: 'quantum',     en: ['quantum','qubit','qubits'],  pt: ['quantico','quantica','qubit'],  es: ['cuantico','cuantica','qubit'], ru: ['квантовый','квантовая','кубит'], ja: ['量子','キュービット'],   zh: ['量子','量子比特'] },
  { id: 'crypto',      en: ['crypto','cryptocurrency','bitcoin','ethereum'], pt: ['cripto','criptomoeda','bitcoin','ethereum'], es: ['cripto','criptomoneda','bitcoin','ethereum'], ru: ['крипто','криптовалюта','биткоин','эфириум'], ja: ['暗号','仮想通貨','ビットコイン'], zh: ['加密','加密货币','比特币','加密貨幣','比特幣'] },
  { id: 'cyber',       en: ['cyber','cyberattack','hack','hacker','hacking','breach'], pt: ['ciber','ciberataque','hacker','invasao'], es: ['ciber','ciberataque','hacker','filtracion'], ru: ['кибер','кибератака','хакер','взлом'], ja: ['サイバー','ハッカー','不正アクセス'], zh: ['网络攻击','黑客','駭客','網路攻擊'] },
  { id: 'chip',        en: ['chip','chips','semiconductor','semiconductors'], pt: ['chip','chips','semicondutor','semicondutores'], es: ['chip','chips','semiconductor','semiconductores'], ru: ['чип','чипы','полупроводник'], ja: ['チップ','半導体'], zh: ['芯片','晶片','半导体','半導體'] },
  { id: 'satellite',   en: ['satellite','satellites'],    pt: ['satelite','satelites'],         es: ['satelite','satelites'],       ru: ['спутник','спутники'],            ja: ['衛星','人工衛星'],        zh: ['卫星','衛星'] },
  { id: 'rocket_sci',  en: ['spacex','nasa','launch','space'], pt: ['espacial','espaco','lancamento'], es: ['espacial','espacio','lanzamiento'], ru: ['космос','космический','запуск'], ja: ['宇宙','打ち上げ'],  zh: ['太空','航天','發射','发射'] },

  // ── countries & key actors (cross-script normalisations) ─────────────────
  { id: 'usa',         en: ['us','usa','american','america','washington'], pt: ['eua','americano','americana','washington'], es: ['eeuu','estadounidense','washington'], ru: ['сша','американский','вашингтон'], ja: ['米国','アメリカ','ワシントン'], zh: ['美国','美國','华盛顿','華盛頓'] },
  { id: 'china',       en: ['china','chinese','beijing'], pt: ['china','chinesa','chines','pequim'], es: ['china','chino','pekin'],   ru: ['китай','китайский','пекин'],     ja: ['中国','中国の','北京'],   zh: ['中国','中國','北京'] },
  { id: 'russia',      en: ['russia','russian','moscow','kremlin'], pt: ['russia','russo','russa','moscou','kremlin'], es: ['rusia','ruso','rusa','moscu','kremlin'], ru: ['россия','российский','москва','кремль'], ja: ['ロシア','モスクワ','クレムリン'], zh: ['俄罗斯','俄羅斯','莫斯科','克里姆林'] },
  { id: 'ukraine',     en: ['ukraine','ukrainian','kyiv','kiev'], pt: ['ucrania','ucraniano','kiev'], es: ['ucrania','ucraniano','kiev'], ru: ['украина','украинский','киев'], ja: ['ウクライナ','キーウ','キエフ'], zh: ['乌克兰','烏克蘭','基辅','基輔'] },
  { id: 'israel',      en: ['israel','israeli','jerusalem','telaviv'], pt: ['israel','israelense','israelita','jerusalem'], es: ['israel','israeli','jerusalen'], ru: ['израиль','израильский','иерусалим'], ja: ['イスラエル','エルサレム'], zh: ['以色列','耶路撒冷'] },
  { id: 'palestine',   en: ['palestine','palestinian','gaza','hamas','westbank'], pt: ['palestina','palestino','gaza','hamas'], es: ['palestina','palestino','gaza','hamas'], ru: ['палестина','палестинский','газа','хамас'], ja: ['パレスチナ','ガザ','ハマス'], zh: ['巴勒斯坦','加沙','哈马斯','哈馬斯'] },
  { id: 'iran',        en: ['iran','iranian','tehran'],   pt: ['ira','iraniano','teerao'],      es: ['iran','irani','teheran'],     ru: ['иран','иранский','тегеран'],     ja: ['イラン','テヘラン'],      zh: ['伊朗','德黑兰','德黑蘭'] },
  { id: 'iraq',        en: ['iraq','iraqi','baghdad'],    pt: ['iraque','iraquiano','bagda'],   es: ['irak','iraqui','bagdad'],     ru: ['ирак','иракский','багдад'],      ja: ['イラク','バグダッド'],    zh: ['伊拉克','巴格达','巴格達'] },
  { id: 'syria',       en: ['syria','syrian','damascus'], pt: ['siria','sirio','damasco'],      es: ['siria','sirio','damasco'],    ru: ['сирия','сирийский','дамаск'],    ja: ['シリア','ダマスカス'],    zh: ['叙利亚','大马士革','敘利亞','大馬士革'] },
  { id: 'lebanon',     en: ['lebanon','lebanese','beirut','hezbollah'], pt: ['libano','libanes','beirute','hezbollah'], es: ['libano','libanes','beirut','hezbola'], ru: ['ливан','ливанский','бейрут','хезболла'], ja: ['レバノン','ベイルート','ヒズボラ'], zh: ['黎巴嫩','贝鲁特','真主党','貝魯特','真主黨'] },
  { id: 'turkey',      en: ['turkey','turkish','ankara','istanbul','erdogan'], pt: ['turquia','turco','ancara','istambul','erdogan'], es: ['turquia','turco','ankara','estambul','erdogan'], ru: ['турция','турецкий','анкара','стамбул','эрдоган'], ja: ['トルコ','アンカラ','イスタンブール'], zh: ['土耳其','安卡拉','伊斯坦布尔','伊斯坦堡'] },
  { id: 'india',       en: ['india','indian','delhi','modi'], pt: ['india','indiano','deli'],   es: ['india','indio','nueva','delhi'], ru: ['индия','индийский','дели'],   ja: ['インド','デリー'],        zh: ['印度','新德里'] },
  { id: 'pakistan',    en: ['pakistan','pakistani','islamabad'], pt: ['paquistao','paquistanes','islamabade'], es: ['pakistan','pakistani','islamabad'], ru: ['пакистан','пакистанский','исламабад'], ja: ['パキスタン','イスラマバード'], zh: ['巴基斯坦','伊斯兰堡','伊斯蘭堡'] },
  { id: 'japan',       en: ['japan','japanese','tokyo'],  pt: ['japao','japones','toquio'],     es: ['japon','japones','tokio'],    ru: ['япония','японский','токио'],     ja: ['日本','東京'],            zh: ['日本','东京','東京'] },
  { id: 'korea_n',     en: ['north','korea','korean','pyongyang','kim','jong','un'], pt: ['coreia','norte','norcoreano','pyongyang'], es: ['corea','norte','norcoreano','pyongyang'], ru: ['кндр','северная','корея','пхеньян'], ja: ['北朝鮮','平壌','金正恩'], zh: ['朝鲜','平壤','金正恩','朝鮮'] },
  { id: 'korea_s',     en: ['south','korean','seoul'],    pt: ['sul','sulcoreano','seul'],      es: ['sur','surcoreano','seul'],    ru: ['южная','сеул'],                  ja: ['韓国','ソウル'],          zh: ['韩国','首尔','韓國','首爾'] },
  { id: 'taiwan',      en: ['taiwan','taiwanese','taipei'], pt: ['taiwan','taiwanes','taipe'],  es: ['taiwan','taiwanes','taipei'], ru: ['тайвань','тайваньский','тайбэй'], ja: ['台湾','台北'],          zh: ['台湾','台北','台灣'] },
  { id: 'uk',          en: ['uk','britain','british','london'], pt: ['reino','unido','britanico','londres'], es: ['reino','unido','britanico','londres'], ru: ['великобритания','британский','лондон'], ja: ['英国','ロンドン'],     zh: ['英国','伦敦','英國','倫敦'] },
  { id: 'france',      en: ['france','french','paris','macron'], pt: ['franca','frances','paris','macron'], es: ['francia','frances','paris','macron'], ru: ['франция','французский','париж','макрон'], ja: ['フランス','パリ','マクロン'], zh: ['法国','巴黎','法國'] },
  { id: 'germany',     en: ['germany','german','berlin'], pt: ['alemanha','alemao','alema','berlim'], es: ['alemania','aleman','berlin'], ru: ['германия','немецкий','берлин'], ja: ['ドイツ','ベルリン'],     zh: ['德国','柏林','德國'] },
  { id: 'spain',       en: ['spain','spanish','madrid'],  pt: ['espanha','espanhol','madrid'],  es: ['espana','espanol','madrid'],  ru: ['испания','испанский','мадрид'],  ja: ['スペイン','マドリード'], zh: ['西班牙','马德里','馬德里'] },
  { id: 'brazil',      en: ['brazil','brazilian','brasilia','lula','bolsonaro'], pt: ['brasil','brasileiro','brasileira','brasilia','lula','bolsonaro'], es: ['brasil','brasileno','brasilia','lula','bolsonaro'], ru: ['бразилия','бразильский','бразилиа'], ja: ['ブラジル','ブラジリア'], zh: ['巴西','巴西利亚','巴西利亞'] },
  { id: 'mexico',      en: ['mexico','mexican'],          pt: ['mexico','mexicano'],            es: ['mexico','mexicano'],          ru: ['мексика','мексиканский'],        ja: ['メキシコ'],              zh: ['墨西哥'] },
  { id: 'venezuela',   en: ['venezuela','venezuelan','maduro','caracas'], pt: ['venezuela','venezuelano','maduro','caracas'], es: ['venezuela','venezolano','maduro','caracas'], ru: ['венесуэла','венесуэльский','мадуро','каракас'], ja: ['ベネズエラ','マドゥロ','カラカス'], zh: ['委内瑞拉','委內瑞拉','馬杜洛'] },
  { id: 'argentina',   en: ['argentina','argentine','buenos','aires','milei'], pt: ['argentina','argentino','buenos','aires','milei'], es: ['argentina','argentino','buenos','aires','milei'], ru: ['аргентина','аргентинский','буэнос','айрес'], ja: ['アルゼンチン','ブエノスアイレス'], zh: ['阿根廷','布宜诺斯艾利斯','布宜諾斯艾利斯'] },
  { id: 'africa',      en: ['africa','african','sahel'],  pt: ['africa','africano','africana','sahel'], es: ['africa','africano','africana','sahel'], ru: ['африка','африканский','сахель'], ja: ['アフリカ','サヘル'],   zh: ['非洲','萨赫勒','薩赫勒'] },
];

// Per-language stopwords. EN/PT/ES are kept in sync with public/db.js trending
// stopwords. RU/JA/ZH lists are short — they only need to remove the highest-
// frequency function tokens; the dictionary itself does most of the work.
export const STOPWORDS = {
  en: new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','has','have','had','will','would',
    'can','could','do','does','did','not','by','as','from','this','that',
    'it','its','he','she','they','we','you','said','says','new','one','two',
    'may','also','after','before','about','more','over','up','out','into',
    'who','what','when','where','why','how','than','then','so','if','no',
    'comments','comment','continue','reading','read',
  ]),
  pt: new Set([
    'o','a','os','as','um','uma','uns','umas','de','do','da','dos','das',
    'em','no','na','nos','nas','por','para','com','ao','aos',
    'que','se','nao','e','foi','sao','esta','ser','ter','ou','mas',
    'mais','ja','ele','ela','eles','elas','seu','sua','seus','suas',
    'pelo','pelos','pela','pelas','sobre','segundo','entre','contra','ate',
    'este','estes','estas','esse','essa','esses','essas','isso','isto',
    'neste','nesta','nestes','nestas','nesse','nessa','nesses','nessas',
    'deste','desta','desse','dessa',
    'ainda','quando','onde','entao','tambem','depois','antes','durante',
    'como','anos','ano','dia','dias','semana','apos','feira',
    'leia','clique','veja','aqui',
    'segunda','terca','quarta','quinta','sexta','sabado','domingo',
    'hoje','ontem','amanha','noticia','noticias','comentarios',
  ]),
  es: new Set([
    'el','la','los','las','un','una','del','al','con','por','para','que',
    'en','no','es','son','fue','han','esta','se','su','sus','y','o',
    'pero','mas','muy','como','este','estos','estas','tambien',
    'sobre','segun','entre','contra',
  ]),
  ru: new Set([
    'и','в','во','не','что','он','на','я','с','со','как','а','то','все',
    'она','так','его','но','да','ты','к','у','же','вы','за','бы','по',
    'только','ее','мне','было','от','меня','о','из','ему','теперь','когда',
    'даже','ну','вдруг','ли','если','уже','или','ни','быть','был','него',
  ]),
  ja: new Set([
    'の','に','は','を','が','と','も','で','から','へ','まで','や','など',
    'する','した','して','です','ます','こと','これ','それ','あれ','この',
    'その','あの','ため','よう','れる','られる','ない','ある','いる','なる',
  ]),
  zh: new Set([
    '的','了','是','在','和','也','都','就','人','我','你','他','她','它',
    '们','这','那','有','不','与','及','或','但','而','所','以','为','被',
    '一','二','三','上','下','中','大','小','后','前','里','外','到','从',
  ]),
};

// All stopwords merged (used by hashed-embeddings worker which is language-agnostic)
export const GLOBAL_STOPWORDS = new Set([
  ...STOPWORDS.en, ...STOPWORDS.pt, ...STOPWORDS.es,
  ...STOPWORDS.ru, ...STOPWORDS.ja, ...STOPWORDS.zh,
]);

// Light per-language suffix stripping. Identity function for ja/zh because
// CJK has no inflectional suffixes — bigram tokenisation handles morphology.
function stripLatinSuffix(t) {
  if (t.length <= 4) return t;
  // Order matters: longest suffix first.
  const SUFFIXES = ['cion','sion','ment','ness','ity','ies','ing','ado','ada','ido','ida','tion','ous','ive','ize','ise','ed','es','er','or','al','ar','an','os','as','os','ly','s'];
  for (const s of SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 3) return t.slice(0, -s.length);
  }
  return t;
}

function stripCyrillicSuffix(t) {
  if (t.length <= 4) return t;
  const SUFFIXES = ['ость','ение','ания','ении','ями','ями','ого','его','ому','ему','ыми','ими','ой','ей','ая','яя','ое','ее','ие','ые','ам','ям','ах','ях','ов','ев','ы','и','а','я','е','у','ю','о'];
  for (const s of SUFFIXES) {
    if (t.endsWith(s) && t.length - s.length >= 3) return t.slice(0, -s.length);
  }
  return t;
}

export const LIGHT_STEM = {
  en: stripLatinSuffix,
  pt: stripLatinSuffix,
  es: stripLatinSuffix,
  ru: stripCyrillicSuffix,
  ja: t => t,
  zh: t => t,
};

// Build the reverse index: per-language map from any surface form to concept id.
// Done at import time so workers can use it directly.
export const REVERSE_INDEX = (() => {
  const idx = { en: new Map(), pt: new Map(), es: new Map(), ru: new Map(), ja: new Map(), zh: new Map() };
  for (const c of CONCEPTS) {
    for (const lang of ['en','pt','es','ru','ja','zh']) {
      const terms = c[lang] || [];
      for (const t of terms) idx[lang].set(t, c.id);
    }
  }
  return idx;
})();
