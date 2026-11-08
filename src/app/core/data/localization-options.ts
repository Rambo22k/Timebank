export interface CountryOption { code: string; name: string; }
export interface LanguageOption { code: string; name: string; }

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(' ');
const COUNTRY_NAMES = new Intl.DisplayNames(['es'], { type: 'region' });
export const COUNTRY_OPTIONS: CountryOption[] = COUNTRY_CODES
  .map(code => ({ code, name: COUNTRY_NAMES.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

const LANGUAGE_CODES = `af am ar az be bg bn bs ca ceb co cs cy da de el en eo es et eu fa fi fil fj fr fy ga gd gl gu ha he hi hr ht hu hy id ig is it ja jv ka kk km kn ko ku ky la lb lo lt lv mg mi mk ml mn mr ms mt my ne nl no ny om or pa pl ps pt ro ru rw sd si sk sl sn so sq sr su sv sw ta te th tk tl tr tt ug uk ur uz vi wo xh yi yo zh zu`.split(' ');
const LANGUAGE_NAMES = new Intl.DisplayNames(['es'], { type: 'language' });
export const LANGUAGE_OPTIONS: LanguageOption[] = LANGUAGE_CODES
  .map(code => ({ code, name: LANGUAGE_NAMES.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

export function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find(language => language.code === code)?.name ?? code;
}
