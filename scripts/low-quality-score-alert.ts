/**
 *
 * Low Quality Score Alert
 *
 * This script finds the low QS keywords (determined by a user defined threshold)
 * and sends an email listing them. Optionally it also labels and/or pauses the
 * keywords.
 *
 * Version: 1.0
 * Google AdWords Script maintained on brainlabsdigital.com
 *
 **/

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//Options

var EMAIL_ADDRESSES = ['alice@example.com', 'bob@example.co.uk']
// The address or addresses that will be emailed a list of low QS keywords
// eg ["alice@example.com", "bob@example.co.uk"] or ["eve@example.org"]

var QS_THRESHOLD = 5
// Keywords with quality score less than or equal to this number are
// considered 'low QS'

var LABEL_KEYWORDS = true
// If this is true, low QS keywords will be automatically labelled

var LOW_QS_LABEL_NAME = 'Low QS Keyword'
// The name of the label applied to low QS keywords

var PAUSE_KEYWORDS = false
// If this is true, low QS keywords will be automatically paused
// Set to false if you want them to stay active.

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Functions

function main() {
  Logger.log('Pause Keywords: ' + PAUSE_KEYWORDS)
  Logger.log('Label Keywords: ' + LABEL_KEYWORDS)

  var keywords = findKeywordsWithQSBelow(QS_THRESHOLD)
  Logger.log('Found ' + keywords.length + ' keywords with low quality score')

  if (!labelExists(LOW_QS_LABEL_NAME)) {
    Logger.log(
      Utilities.formatString('Creating label: "%s"', LOW_QS_LABEL_NAME)
    )
    AdWordsApp.createLabel(
      LOW_QS_LABEL_NAME,
      'Automatically created by QS Alert',
      'red'
    )
  }

  var mutations = [
    {
      enabled: PAUSE_KEYWORDS,
      callback: function (keyword) {
        keyword.pause()
      },
    },
    {
      enabled: LABEL_KEYWORDS,
      callback: function (keyword, currentLabels) {
        if (currentLabels.indexOf(LOW_QS_LABEL_NAME) === -1) {
          keyword.applyLabel(LOW_QS_LABEL_NAME)
        }
      },
    },
  ]

  var chunkSize = 10000
  var chunkedKeywords = chunkList(keywords, chunkSize)

  Logger.log('Making changes to keywords..')
  chunkedKeywords.forEach(function (keywordChunk) {
    mutateKeywords(keywordChunk, mutations)
  })

  if (keywords.length > 0) {
    sendEmail(keywords)
    Logger.log('Email sent.')
  } else {
    Logger.log('No email to send.')
  }
}

function findKeywordsWithQSBelow(threshold) {
  var query =
    'SELECT ad_group.id, ad_group_criterion.criterion_id, campaign.name, ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, ad_group_criterion.labels FROM keyword_view WHERE ad_group_criterion.status = "ENABLED" AND ad_group_criterion.quality_info.quality_score <= ' +
    threshold
  var report = AdWordsApp.report(query)
  var rows = report.rows()

  var lowQSKeywords = []
  while (rows.hasNext()) {
    var row = rows.next()
    console.log(row)
    var lowQSKeyword = {
      campaignName: row['campaign.name'],
      adGroupName: row['ad_group.name'],
      keywordText: row['ad_group_criterion'],
      labels:
        row['ad_group_criterion.labels'] &&
        row['ad_group_criterion.labels']?.trim() !== '--'
          ? JSON.parse(row['ad_group_criterion.labels'])
          : [],
      uniqueId: [row['ad_group.id'], row['ad_group_criterion.criterion_id']],
      qualityScore: row['ad_group_criterion.quality_info.quality_score'],
    }
    lowQSKeywords.push(lowQSKeyword)
  }
  return lowQSKeywords
}

function labelExists(labelName) {
  var condition = Utilities.formatString('LabelName = "%s"', labelName)
  return AdWordsApp.labels().withCondition(condition).get().hasNext()
}

function chunkList(list, chunkSize) {
  var chunks = []
  for (var i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize))
  }
  return chunks
}

function mutateKeywords(keywords, mutations) {
  var keywordIds = keywords.map(function (keyword) {
    return keyword['uniqueId']
  })

  var mutationsToApply = getMutationsToApply(mutations)
  var adwordsKeywords = AdWordsApp.keywords().withIds(keywordIds).get()

  var i = 0
  while (adwordsKeywords.hasNext()) {
    var currentKeywordLabels = keywords[i]['labels']
    var adwordsKeyword = adwordsKeywords.next()

    mutationsToApply.forEach(function (mutate) {
      mutate(adwordsKeyword, currentKeywordLabels)
    })
    i++
  }
}

function getMutationsToApply(mutations) {
  var enabledMutations = mutations.filter(function (mutation) {
    return mutation['enabled']
  })

  return enabledMutations.map(function (condition) {
    return condition['callback']
  })
}

function sendEmail(keywords) {
  var subject = 'Low Quality Keywords Paused'
  var htmlBody =
    '<p>Keywords with a quality score of less than ' +
    QS_THRESHOLD +
    'found.<p>' +
    '<p>Actions Taken:<p>' +
    '<ul>' +
    '<li><b>Paused</b>: ' +
    PAUSE_KEYWORDS +
    '</li>' +
    '<li><b>Labelled</b> with <code>' +
    LOW_QS_LABEL_NAME +
    '</code>: ' +
    LABEL_KEYWORDS +
    '</li>' +
    '</ul>' +
    renderTable(keywords)

  MailApp.sendEmail({
    to: EMAIL_ADDRESSES.join(','),
    subject: subject,
    htmlBody: htmlBody,
  })
}

function renderTable(keywords) {
  var header =
    '<table border="2" cellspacing="0" cellpadding="6" rules="groups" frame="hsides">' +
    '<thead><tr>' +
    '<th>Campaign Name</th>' +
    '<th>Ad Group Name</th>' +
    '<th>Keyword Text</th>' +
    '<th>Quality Score</th>' +
    '</tr></thead><tbody>'

  var rows = keywords.reduce(function (accumulator, keyword) {
    return (
      accumulator +
      '<tr><td>' +
      [
        keyword['campaignName'],
        keyword['adGroupName'],
        keyword['keywordText'],
        keyword['qualityScore'],
      ].join('</td><td>') +
      '</td></tr>'
    )
  }, '')

  var footer = '</tbody></table>'

  var table = header + rows + footer
  return table
}