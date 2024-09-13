const puppeteer = require('puppeteer');
const fs = require("fs");

// 設定情報
const LOGIN_URL = 'https://gojin1-test.flex-crm.com/login/';
const USER_ID = 'kameoka';
const PASSWORD = 'encom1234';
const TABLE_URL = 'https://gojin1-test.flex-crm.com/flexdb/tbl_adopt_application/setting_fields/';

// ---MEMO:開発環境用 791_【人事・業務】FlexDB 採用・新規契約申請の分離と登録処理の自動化【WEB】--------------
// 【人事】【業務】採用申請／新規契約申請（業務委託）----- 現行FlexDB
// const TABLE_URL = 'https://gojin1-test.flex-crm.com/flexdb/tbl_adopt_application/setting_fields/';
// 【人事】採用申請（雇用））----- 新規FlexDB
// const TABLE_URL = 'https://gojin1-test.flex-crm.com/flexdb/tbl_adopt_application_jinji/setting_fields/';
// ------------------------------------------------------------------------------------------

// 定数を作成
const CONDITIONS = {
    EMPTY_STRING: 'empty',
    NO_FIELD: 'no_field',
    ALREADY_PROCESSED: 'processed',
    HAS_FIELD: 'has_field'
};

// 条件に応じた処理結果とログの出力を定義
const ACTIONS = {
    [CONDITIONS.EMPTY_STRING]: { process: false, log: false, message: undefined},
    [CONDITIONS.NO_FIELD]: { process: false, log: true, message: (fieldName) => `${fieldName}: NG    指定フィールドがテーブルに存在しません`},
    [CONDITIONS.ALREADY_PROCESSED]: { process: false, log: true, message: (fieldName) => `${fieldName}: 処理済み`},
    [CONDITIONS.HAS_FIELD]: { process: true, log: true, message: (fieldName) => `${fieldName}: OK`}
};

const readline = require('readline');

/**
 * 遅延処理
 * @param {Number} time
 * @returns {Promise}
 */
function delay(time) {
	return new Promise(function(resolve) {
		setTimeout(resolve, time)
	});
}

// 文字入力
const inputString = prompt =>{
    const readInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve =>readInterface.question(prompt,
        inputString=>{
            readInterface.close();
            resolve(inputString);
        }));
};

// メイン処理
(async function(){
	const browser = await puppeteer.launch({ headless: false});

	const page = await browser.newPage();
	await page.goto(LOGIN_URL);
	await page.type('input[name=userid]', USER_ID);
	await page.type('input[name=password]', PASSWORD);
	page.click('button[name="login"]');
	await page.waitForNavigation({timeout: 20000, waitUntil: "domcontentloaded"});

	await page.goto(TABLE_URL, {timeout: 20000, waitUntil: "domcontentloaded"});
    let rows;
    try {
        const data = fs.readFileSync('./fieldNameList.csv', 'utf8');
        rows = data.split('\n').map(row => row.split(','));
    } catch (err) {
        console.error('field.csv読み込み失敗', err);
    }

    const string = await inputString("指定フィールド名への接頭辞★付けを開始しますがよろしいですか？（y:はい、n:いいえ)：");
    if (string == "y") {
        for (fieldNames of rows) {
            const fieldName = fieldNames[0].replace(/[\r\n]/g, '');

            const condition = await page.evaluate((fieldName, CONDITIONS) => {
                if (fieldName.trim() === '') {
                    return CONDITIONS.EMPTY_STRING;
                }
                targetTd = $("td").filter(function() {
                    // td要素のtextcontent内にspan要素がある場合があります
                    let textWithoutSpan = $(this).clone().find("span").remove().end().text().trim();
                    return textWithoutSpan === fieldName || textWithoutSpan === '★' + fieldName;
                });
                if (targetTd.text().trim().startsWith('★')) {
                    return CONDITIONS.ALREADY_PROCESSED;
                }
                if (targetTd.length === 0){
                    return CONDITIONS.NO_FIELD;
                }

                targetTd.closest("tr").click();
                return CONDITIONS.HAS_FIELD
            }, fieldName, CONDITIONS);

            // アクション
            const action = ACTIONS[condition];
            if (action.process) {
                await page.waitForSelector('.js-modal-save-column', {visible: true, timeout: 10000});
                await page.evaluate((fieldName) => {
                    $('input[name="display_name"]').val("★" + fieldName);
                }, fieldName);
                let saveButton = await page.$(".js-modal-save-column .js-modal-save");
                await saveButton.click();
                await page.waitForNavigation({timeout: 20000, waitUntil: "domcontentloaded"});
                console.log(fieldName + ": OK");
                // 自動計算処理中に次のフィールドへアクセスするとアラートが発生して処理が止まります。
                delay(2000);
            }

            // ログ
            if (action.log) {
                console.log(action.message(fieldName));
            }
        }
        await browser.close();
    } else {
        await browser.close();
    }
})();