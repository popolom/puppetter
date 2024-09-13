const puppeteer = require('puppeteer');
const fs = require("fs");

// 設定情報
const LOGIN_URL = 'https://gojin1-test.flex-crm.com/login/';
const USER_ID = 'kameoka';
const PASSWORD = 'encom1234';
const TABLE_URL = 'https://gojin1-test.flex-crm.com/flexdb/tbl_ucqpox/setting_fields/';

// データ型
// データ型
const INPUT_TYPES = {
	ONE_LINE_TEXT: {
		id: 15,
		value: "1行テキスト",
	},
	TEXT: {
		id: 1,
		value: "テキスト",
	},
	NUMBER: {
		id: 2,
		value: "数値",
	},
	SELECT: {
		id: 3,
		value: "選択肢",
	},
	DATE: {
		id: 4,
		value: "日時",
	},
	ADDRESS: {
		id: 7,
		value: "住所",
	},
	TEL: {
		id: 8,
		value: "電話番号",
	},
	EMAIL: {
		id: 9,
		value: "メールアドレス",
	},
	USER: {
		id: 10,
		value: "ユーザ",
	},
	FILE: {
		id: 12,
		value: "ファイル",
	},
	RELATION: {
		id: 13,
		value: "リレーション",
	},
	REFERENCE: {
		id: 16,
		value: "参照",
	},
	CALCULATION: {
		id: 17,
		value: "計算結果",
	},
};

/**
 * プルダウンのテキスト取得
 * 
 * @param {Object} page // puppeteerのpageオブジェクト
 * @param {String} selector // 対象要素のセレクタ
 * @returns {Promise}
 */
async function getSelectText(page, selector) {
	const targetVal = await page.$eval(selector, node => node.value);
	const selectedText = await page.$$eval(
		`${selector} option`,
		(els, targetVal) =>
			els.find(el => el.value === targetVal).textContent,
		targetVal
	);
	return selectedText;
}

/**
 * チェックボックスの入力値取得
 * 
 * @param {Object} page // puppeteerのpageオブジェクト
 * @param {String} selector // 対象要素のセレクタ
 * @returns {Promise}
 */
async function getCheckboxInput(page, selector) {
	const checkbox = await page.$(selector);
	const value = await (await checkbox.getProperty('checked')).jsonValue();
	return value ? 1 : 0;
}

/**
 * フィールド設定の取得
 * 
 * @param {Object} page // puppeteerのpageオブジェクト
 * @returns {Promise}
 */
async function getFieldSettings(page) {
	const inputTypeVal = parseInt(await page.$eval('select[name=input_type]', node => node.value));
	const inputType = Object.values(INPUT_TYPES).find(element => element.id == inputTypeVal);
	const item = {
		"type": inputType.value,
		"fieldname": await page.$eval('input[name=display_name]', node => node.value),
		"fieldid": await page.$eval('input[name=field_id]', node => node.value),
		"order": await page.$eval('select[name=rank]', node => node.value),
		"sort": await getCheckboxInput(page, 'input[name=sort_target]'),
	};
	let elements = null;
	switch (inputTypeVal) {
		case INPUT_TYPES.ONE_LINE_TEXT.id:
			item["title"] = await getCheckboxInput(page, 'input[name=primary_type]');
			break;
		case INPUT_TYPES.NUMBER.id:
			item["numbering"] = await getCheckboxInput(page, 'input[name=auto_numbering_check]');
			break;
		case INPUT_TYPES.RELATION.id:
			item["table"] = await getSelectText(page, 'select[name=relation_data_table_meta_id]');
			elements = await page.$$('ul.js-target-column > li > span');
			let searchTargets = [];
			for (const element of elements) {
				const value = await page.evaluate(el => el.textContent, element);
				searchTargets.push(value);
			}
			item["search_target"] = searchTargets;
			item["display_item"] = await getSelectText(page, 'select[name=relation_data_column_meta_id]');
			item["set_search_condition"] = await getCheckboxInput(page, 'input[name=suggest_select_search_check]');
			if (item["set_search_condition"] == 1) {
				const operatorInput = await page.$eval('input[name=operator]', node => node.value);
				const operatorText = await page.evaluate(el => el.textContent, await page.$(`label[for=radio${operatorInput}]`));
				elements = await page.$$('ul.js-filter-cond-detail > li');
				const conditions = [];
				for (const element of elements) {
					const condition = {};
					condition["field"] = await page.evaluate(el => el.textContent, await element.$('div.js-edit span'));
					const targetVal = await element.$eval('select.js-option', node => node.value);
					const selectedText = await element.$$eval(
						`select.js-option option`,
						(els, targetVal) =>
							els.find(el => el.value === targetVal).textContent,
						targetVal
					);
					condition["operator"] = selectedText;
					condition["value"] = await element.$eval('div.js-edit input', node => node.value);
					conditions.push(condition);
				}
				item["search_condition"] = {
					operator: operatorText,
					conditions: conditions,
				}
			}
			const recordNum = await page.$eval('input[name=reference_record_number_type]', node => node.value);
			const recordNumSelected = await page.$(`input[name=reference_record_number_type][value="${recordNum}"]`);
			const recordNumText = await page.evaluate(el => el.textContent, await recordNumSelected.getProperty('parentNode'))
			item["record_num"] = recordNumText;
			item["title"] = await getCheckboxInput(page, 'input[name=primary_type]');
			break;
		case INPUT_TYPES.SELECT.id:
			const selectType = await page.$eval('input[name=select_type]:checked', node => node.value);
			const selectTypeSelected = await page.$(`input[name=select_type][value="${selectType}"]`);
			const selectTypeSelectedText = await page.evaluate(el => el.textContent, await selectTypeSelected.getProperty('parentNode'))
			item["select"] = selectTypeSelectedText;
			elements = await page.$$('table.js-column-select > tbody > tr');
			const selectItems = [];
			for (const element of elements) {
				const selectItem = {};
				selectItem["no"] = await page.evaluate(el => el.textContent, await element.$('th.js-column-select-rank'));
				selectItem["name"] = await page.evaluate(el => el.textContent, await element.$('td.js-column-select-text-name'))
				if (await element.$('td.js-column-select-text-default > span') !== null) {
					selectItem["default"] = 1;
				} else {
					selectItem["default"] = 0;
				}
				selectItems.push(selectItem);
			}
			item["item"] = selectItems;
			item["unchangeable"] = await getCheckboxInput(page, 'input[name=unchangeable_type_select]');
			break;
		case INPUT_TYPES.FILE.id:
			item["file_order_type"] = await getSelectText(page, 'select[name=file_order_type]');
			item["file_order"] = await getSelectText(page, 'select[name=file_order]');
			break;
		case INPUT_TYPES.REFERENCE.id:
			item["reference_table"] = await getSelectText(page, 'select[name=reference_column_meta_id]');
			await page.waitForSelector('select[name=reference_data_column_meta_id]', {visible: true});
			item["display_item"] = await getSelectText(page, 'select[name=reference_data_column_meta_id]');
			break;
		case INPUT_TYPES.USER.id:
			if (await page.$('input[name=ref_process_flg]')) {
				item["ref_process"] = await getCheckboxInput(page, 'input[name=ref_process_flg]');
				if (item["ref_process"] == 1) {
					item["process"] = await getSelectText(page, 'select[name=ref_process_id]');
				}
			} else {
				item["process"] = 0;
			}
			break;
	}
	return item;
}

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
	await page.screenshot({path: 'example.png'});
	const editColumnButtons = await page.$$('.js-modal-edit-column');
	const results = [];

	for (const editColumnButton of editColumnButtons) {
		await editColumnButton.click();
		await page.waitForSelector('.js-modal-save-column', {visible: true, timeout: 10000});
		const item = await getFieldSettings(page);	
		results.push(item);
		const closeButton = await page.$('.js-modal-save-column > .js-modal-close');
		await closeButton.click();
		await page.waitForSelector('.js-modal-save-column', {hidden: true});
		await delay(1000);
	}
	// JSONファイルの出力
	const json_text = JSON.stringify(results, null , "\t");
	fs.writeFile("setting.json", json_text, (error) => {
		// 書き込みエラー
		if (error) {
		  console.error(error);	  
		  throw error;
		}
		console.log("setting.json written correctly");
	});

	await browser.close();
})();