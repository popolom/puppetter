const puppeteer = require('puppeteer');
const fs = require("fs");

// 設定情報
const LOGIN_URL = 'https://gojin3-test.flex-crm.com/login/';
const USER_ID = 'ishigaki';
const PASSWORD = ':]RN1haD';
const TABLE_URL = 'https://gojin3-test.flex-crm.com/flexdb/tbl_wxw3aj/setting_fields';
const VIEW_IDS = ["31308", "31309"];

// データ型
const INPUT_TYPES = {
	ONE_LINE_TEXT: "1行テキスト",
	TEXT: "テキスト",
	NUMBER: "数値",
	SELECT: "選択肢",
	DATE: "日時",
	FILE: "ファイル",
	RELATION: "リレーション",
	REFERENCE: "参照",
	CALCULATION: "計算結果",
    USER: "ユーザ",
};

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

/**
 * プルダウンの値取得
 * @param {Object} page // puppeteerのpageオブジェクト
 * @param {String} name // selectのname属性
 * @returns {Promise}
 */
async function getSelectVal(page, name, text) {
    const option = (await page.$x(
        `//*[@name = "${name}"]/option[text() = "${text}"]`
    ))[0];
    return await (await option.getProperty('value')).jsonValue();
}

/**
 * ラジオボタンの取得
 * @param {Object} page // puppeteerのpageオブジェクト
 * @param {String} label // ラジオボタンのlabelテキスト
 * @returns {Promise}
 */
async function getRadio(page, text) {
    const label = (await page.$x(
        `//label[text() = "${text}"]`
    ))[0];
    return await label.$('input');
}

const readline = require('readline');

// 文字入力
const inputString = prompt =>{
    const readInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise( resolive =>readInterface.question(prompt,
        inputString=>{
            readInterface.close();
            resolive( inputString);
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

	await page.goto(TABLE_URL);

    const string = await inputString("登録を開始しますがよろしいですか？（y:はい、n:いいえ)：");

    if (string == "y") {
        const data = JSON.parse(fs.readFileSync('./setting.json', 'utf8'));

        for (element of data) {
            const addColumnButton = await page.$('.js-modal-add-column');
            await addColumnButton.click();
            await page.waitForSelector('.js-modal-save-column', {visible: true, timeout: 10000});
            await page.select('select[name=input_type]', await getSelectVal(page, "input_type", element["type"]));
            await page.type('input[name=display_name]', element["fieldname"]);
            let field_id = '';
            while (true) {
                field_id = await page.$eval('input[name=field_id]', el => el.value);
                if (field_id != '') {
                    break;
                }
            }
            await page.click('input[name=field_id]');
            for (let i = 0; i < field_id.length; i++) {
                await page.keyboard.press('Backspace');
            }
            await page.type('input[name=field_id]', element["fieldid"]);
            await page.select('select[name=rank]', await getSelectVal(page, "rank", element["order"]));
            if (element["sort"] == 1) {
                await page.click('input[name=sort_target]');
            }
            switch(element["type"]) {
                case INPUT_TYPES.ONE_LINE_TEXT:
                    if (element["title"] == 1) {
                        await page.click('input[name=primary_type]');
                    }
                    break;
                case INPUT_TYPES.SELECT:
                    (await getRadio(page, element["select"])).click();
                    let rank = 1;
                    for (item of element["item"]) {
                        await page.type('input.js-column-select-add-name', item["name"]);
                        const addButton = await page.$('button.js-column-select-add');
                        await addButton.click();
                        if (item["default"] == 1) {
                            await page.waitForSelector(`[data-column-select-rank="${rank}"]`);
                            await page.click(`[data-column-select-rank="${rank}"]`);
                            await page.click(`[data-column-select-rank="${rank}"] input[name="input_default_value_select[]"]`);
                            await page.click(`[data-column-select-rank="${rank}"] .js-column-select-save`);
                        }
                        rank++;
                    }
                    if (element["unchangeable"] == 1) {
                        await page.click('input[name=unchangeable_type_select]');
                    }
                    break;
                case INPUT_TYPES.RELATION:
                    await page.select('select[name=relation_data_table_meta_id]', await getSelectVal(page, "relation_data_table_meta_id", element["table"]));
                    await page.waitForSelector(`select[name=suggest_field_names]`, {visible: true});
                    for (target of element["search_target"]) {
                        await page.select('select[name=suggest_field_names]', await getSelectVal(page, "suggest_field_names", target));
                    }
                    await page.waitForSelector(`select[name=relation_data_column_meta_id]`, {visible: true});
                    await page.select('select[name=relation_data_column_meta_id]', await getSelectVal(page, "relation_data_column_meta_id", element["display_item"]));
                    if (element["set_search_condition"] == 1) {
                        await page.click('input[name=suggest_select_search_check]');
                        await page.waitForSelector('.js-condition-detail', {visible: true});
                        const label = (await page.$x(
                            `//label[text() = "${element["search_condition"]["operator"]}"]`
                        ))[0];
                        label.click();
                        for (condition of element["search_condition"]["conditions"]) {
                            const options = await page.$$('select.js-filter-relationcond-select option');
                            for (const option of options) {
                                const text = await page.evaluate(el => el.textContent, option);
                                if (text == condition["field"]) {
                                    value = await page.evaluate(el => el.value, option);
                                    await page.select('select.js-filter-relationcond-select', value);
                                    break;
                                }
                            }
                        }
                        const rows = await page.$$('.js-filter-cond');
                        let index = 0;
                        for (const row of rows) {
                            const options = await row.$$('select.js-option option');
                            for (const option of options) {
                                const text = await page.evaluate(el => el.textContent, option);
                                if (text == element["search_condition"]["conditions"][index]["operator"]) {
                                    value = await page.evaluate(el => el.value, option);
                                    await page.select(`.js-filter-cond-detail .js-filter-cond:nth-child(${index+1}) .js-option`, value);
                                    break;
                                }
                            }
                            await page.type(`.js-filter-cond-detail .js-filter-cond:nth-child(${index+1}) input.js-value`, element["search_condition"]["conditions"][index]["value"]);
                            index++;
                        }
                    }
                    (await getRadio(page, element["record_num"])).click();
                    if (element["title"] == 1) {
                        await page.click('input[name=primary_type]');
                    }
                    break;
                case INPUT_TYPES.FILE:
                    await page.select('select[name=file_order_type]', await getSelectVal(page, "file_order_type", element["file_order_type"]));
                    await page.select('select[name=file_order]', await getSelectVal(page, "file_order", element["file_order"]));
                    break;
                case INPUT_TYPES.REFERENCE:
                    await page.waitForSelector('select[name=reference_column_meta_id]', {visible: true});
                    await page.select('select[name=reference_column_meta_id]', await getSelectVal(page, "reference_column_meta_id", element["reference_table"]));
                    await page.waitForSelector('select[name=reference_data_column_meta_id]', {visible: true});
                    await page.select('select[name=reference_data_column_meta_id]', await getSelectVal(page, "reference_data_column_meta_id", element["display_item"]));
                    break;
                case INPUT_TYPES.USER:
                    if (element["ref_process"] == 1) {
                        await page.click('input[name=ref_process_flg]');
                        await page.waitForSelector('select[name=ref_process_id]', {visible: true});
                        await page.select('select[name=ref_process_id]', await getSelectVal(page, "ref_process_id", element["process"]));
                    }
                    break;
            }
            let saveButton = await page.$('.js-modal-save-column .js-modal-save');
            await saveButton.click();
            try {
                await page.waitForSelector('#modaldiv_pop_viewselect', {visible: true, timeout: 10000});
                const viewSelects = await page.$$('a.js-view-select');
                for (const viewSelect of viewSelects) {
                    let viewId = await page.evaluate(el => el.getAttribute("data-view-id"), viewSelect)
                    if (!VIEW_IDS.includes(viewId)) {
                        await viewSelect.click();
                    }
                }
                saveButton = await page.$('#modaldiv_pop_viewselect .js-modal-save');
                saveButton.click();
                await page.waitForNavigation({timeout: 20000, waitUntil: "domcontentloaded"});
            } catch (e) {
                console.log(e);
                const closeButton = await page.$('.js-modal-save-column > .js-modal-close');
                await closeButton.click();
                await page.waitForSelector('.js-modal-save-column', {hidden: true});
                await delay(1000);
            }
        }
        await browser.close();
    } else {
        await browser.close();
    }
})();