declare module 'vcf' {
  export interface VCardProperty {
    readonly _field: string;
    readonly _data?: string;
    readonly type?: string | string[];
    readonly encoding?: string;
    readonly charset?: string;
    readonly group?: string;
    toJSON(): [string, Record<string, unknown>, string, unknown];
  }

  export interface ParsedVCard {
    version?: string;
    data: Record<string, VCardProperty | VCardProperty[] | undefined>;
  }

  export default class VCard {
    parse(input: string): ParsedVCard;
  }
}
