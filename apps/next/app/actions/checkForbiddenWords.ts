'use server';

import { BloomFilter } from 'bloom-filters';
import crypto from 'crypto';

const bloomFilterData = {
    "type": "BloomFilter",
    "_size": 5589,
    "_nbHashes": 7,
    "_filter": {
        "size": 5592,
        "content": "mSzN4qhso4JBHapZWDK3u8Oz81HoXCe99/neH4a3CMEaLZhYrv1sHzBlpEnrNwHT41GMWL3ZCO/78lAg+6Md5+Q+ZEWfnhHZ3n3bgwlHOrXHOUH82edjH67UGrdX/BzhcGPgiTlDciXmE7ktqu51F7tsodi454dzjBwA1S87mI5MES5JJ1aqHSO91o2EpU8om9DCrY2aKitiq4eAn2gzhhhmm/0roIXnHvZTMLnBG8xSAg/7RX3YBwCyLIctWsouBjIE1bAWYi73q2El1SzU/Q2A7dEp43Q1WhO102Uc7IFdRP7uXodI2CVwsb94tx5YXI1ancNBLUxQmKH+l9/ICAAX+R0N/C7aRKp0Vd5McukF1bGuOovA+SYMWkHQXI9iRIWTE3lureVaHXpQvPyZ5vyo1qB0AVQQ8Hrv547c80MDsIdojz/WPS+cMetB7C0Hn7gjlIa2bg6NXtC8HWbwgYHlQO2m+6PXVFfaGl4SOTbL83rn82np8ZoDUDlmst7Xc5xn+WT6OVfSweW+ZafiZqgkkMv1fa0B/DeFEw1L/c94qfmkocYZP6CC5T+Oq+1tXYshLGdrRPF25sQ67AyFlYzIro3ur1c6Phzx1yQe/xCGcqEzyLGlGf0fg1btg8qQUR8zVJflbhhrYX98z+lyuxj/ePhZD5MXr3pn/i0K4J7eXqG96GkDSKhdfLrclJXUSQXHmE+5lOm0eaOFEcVMHzf33PbFYLj8tcWGsNNyxUMUmOavg85du8W11VXi8m+07bbQ+2pS7jKcVGSiQX/753/Zu84dZB0O6bRmIFV9xW/YE3G7wIkHZwzj+3YQj9oyzt8oHel92mc3ccX2NilUe5k70eSOhE++cmf1T3V+dVKhK7eZMOTrv8LszN/WdKZkEoNfGiLfeD0oMLsPsWS0sIq4nWK2xFsndKQN"
    },
    "_seed": 78187493520
}


function loadBloomFilter() {
    return BloomFilter.fromJSON(JSON.parse(JSON.stringify(bloomFilterData)));
}

function hashWord(word: string): string {
    return crypto.createHash('sha256').update(word).digest('hex');
}

export async function checkForbiddenWords(text: string | null): Promise<boolean> {
    if (!text) {
        return false;
    }

    const forbiddenWordsFilter = loadBloomFilter();
    const words = text.split(' ');
    return words.some(word => forbiddenWordsFilter.has(hashWord(word)));
}