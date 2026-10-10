/** No-login tickets. Run configureReports once as the spreadsheet owner. */
var REPORT_HEADERS=['Ticket ID','Created (UTC)','Status','Name','Email','Identity','Summary','Description','Dashboard page','Snapshot time','Screenshot','Email notification','Request fingerprint'];
function reportSheet_(ss){
  var sheet=ss.getSheetByName('Report');if(!sheet)sheet=ss.insertSheet('Report');
  if(sheet.getLastRow()===0){sheet.appendRow(REPORT_HEADERS);sheet.setFrozenRows(1);}
  if(sheet.getRange(1,1,1,REPORT_HEADERS.length).getValues()[0].join('|')!==REPORT_HEADERS.join('|'))throw new Error('The existing Report tab has different columns. Ask the owner to review it.');
  return sheet;
}
function configureReports(){
  var ss=SpreadsheetApp.getActiveSpreadsheet(),p=PropertiesService.getScriptProperties();reportSheet_(ss);
  var folderId=p.getProperty('REPORT_FOLDER_ID');
  if(folderId)DriveApp.getFolderById(folderId);else folderId=DriveApp.createFolder('Portfolio Desk Report screenshots').getId();
  var recipient=Session.getEffectiveUser().getEmail();MailApp.getRemainingDailyQuota();
  p.setProperties({REPORT_SPREADSHEET_ID:ss.getId(),REPORT_FOLDER_ID:folderId,REPORT_RECIPIENT:recipient||'',REPORT_MODE:'public-tickets-v1'});
  SpreadsheetApp.getUi().alert('Ready: Report tab and private screenshot folder. No visitor sign-in or OAuth Client ID needed. Email recipient: '+(recipient||'none; tickets will still be saved')+'. Deploy a new web-app version executing as you.');
}
function reportConfig_(){var p=PropertiesService.getScriptProperties();return {ok:true,enabled:p.getProperty('REPORT_MODE')==='public-tickets-v1'&&!!p.getProperty('REPORT_SPREADSHEET_ID')&&!!p.getProperty('REPORT_FOLDER_ID'),mode:'public-tickets-v1'};}
function reportCell_(value){return "'"+String(value);}
function reportFingerprint_(values){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(values),Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function reportLimit_(p,now){
  var hour=JSON.parse(p.getProperty('REPORT_PUBLIC_HOUR')||'{"time":0,"count":0}'),day=JSON.parse(p.getProperty('REPORT_PUBLIC_DAY')||'{"time":0,"count":0}');
  if(now-hour.time>=3600000)hour={time:now,count:0};if(now-day.time>=86400000)day={time:now,count:0};
  if(hour.count>=20||day.count>=100)throw new Error('The report service has reached its submission limit. Please try again later.');
  hour.count++;day.count++;p.setProperty('REPORT_PUBLIC_HOUR',JSON.stringify(hour));p.setProperty('REPORT_PUBLIC_DAY',JSON.stringify(day));
}
function doPost(e){
  var persisted=false,ticket='';
  try{
    if(!e||!e.postData||e.postData.contents.length>2850000)throw new Error('Report is missing or too large.');
    var r=JSON.parse(e.postData.contents);if(r.action!=='submitReport')throw new Error('Unsupported request.');
    if(r.website)throw new Error('Report rejected.');
    if(!reportConfig_().enabled)throw new Error('Reporting is not enabled yet. Ask the dashboard owner to finish setup.');
    var name=reportText_(r.name,2,120,'Name').replace(/[\r\n]/g,' '),email=reportText_(r.email,3,254,'Email');
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new Error('Enter a valid email address.');
    var title=reportText_(r.title,5,160,'Summary').replace(/[\r\n]/g,' '),description=reportText_(r.description,10,4000,'Description');
    var page=reportText_(r.page||'#/overview',1,250,'Page');if(!/^#\/[\w/%?=&. -]*$/.test(page))throw new Error('Invalid dashboard page.');
    var updated=reportText_(r.updated||'Unknown',1,150,'Snapshot time');
    if(!/^[a-zA-Z0-9-]{16,64}$/.test(r.requestId||''))throw new Error('Invalid ticket ID.');ticket=r.requestId;
    var attachment=reportAttachment_(r.attachment),fingerprint=reportFingerprint_([name,email,title,description,page,updated,r.attachment?r.attachment.type:'',r.attachment?r.attachment.base64:'']);
    var lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw new Error('Reports are busy. Please try again shortly.');
    try{
      var p=PropertiesService.getScriptProperties(),ss=SpreadsheetApp.openById(p.getProperty('REPORT_SPREADSHEET_ID')),sheet=reportSheet_(ss);
      var match=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(ticket).matchEntireCell(true).findNext():null;
      var row,values;
      if(match){row=match.getRow();values=sheet.getRange(row,1,1,REPORT_HEADERS.length).getValues()[0];
        if(values[12]!==fingerprint)throw new Error('This ticket ID belongs to a different report. Reload the page to start a new report.');
        persisted=true;if(values[2]!=='Processing'&&values[2]!=='Attachment failed')return json_({ok:true,saved:true,reportId:ticket,emailStatus:values[11]});
      }else{
        reportLimit_(p,Date.now());values=[ticket,new Date().toISOString(),'Processing',name,email,'Self-reported (not verified)',title,description,page,updated,'','Not attempted',fingerprint];
        persisted=true;sheet.appendRow(values.map(reportCell_));SpreadsheetApp.flush();row=sheet.getLastRow();
      }
      var screenshot=values[10]||'';
      if(attachment&&!screenshot){try{
        var folder=DriveApp.getFolderById(p.getProperty('REPORT_FOLDER_ID')),filename=ticket+(r.attachment.type==='image/png'?'.png':'.jpg'),existing=folder.getFilesByName(filename);
        var file=existing.hasNext()?existing.next():folder.createFile(attachment.setName(filename));screenshot=file.getUrl();sheet.getRange(row,11).setValue(screenshot);
      }catch(error){sheet.getRange(row,3).setValue('Attachment failed');return json_({ok:false,uncertain:true,reportId:ticket,error:'Ticket saved, but the screenshot could not be stored. Retry the same report to finish uploading it.'});}}
      sheet.getRange(row,3).setValue('Open');SpreadsheetApp.flush();
      var notification='Disabled',recipient=p.getProperty('REPORT_RECIPIENT');
      if(recipient){notification='Pending / unconfirmed';sheet.getRange(row,12).setValue(notification);SpreadsheetApp.flush();
        try{if(MailApp.getRemainingDailyQuota()<1)notification='Not sent: quota exhausted';else{
          var mail={to:recipient,replyTo:email,name:'Portfolio Desk reports',subject:'[Ticket '+ticket+'] '+title,
            body:'A data issue was saved in the Report tab.\nTicket: '+ticket+'\nName: '+name+'\nEmail: '+email+'\nIdentity: self-reported, not verified\nPage: '+page+'\nSnapshot: '+updated+'\n\n'+description+'\n\nScreenshot: '+(screenshot||'None')+'\nReport tab: '+ss.getUrl()+'#gid='+sheet.getSheetId()};
          if(attachment)mail.attachments=[attachment];MailApp.sendEmail(mail);notification='Sent';
        }}catch(error){notification='Not confirmed: check owner inbox';}
      }
      sheet.getRange(row,12).setValue(notification);SpreadsheetApp.flush();return json_({ok:true,saved:true,reportId:ticket,emailStatus:notification});
    }finally{lock.releaseLock();}
  }catch(error){return json_({ok:false,uncertain:persisted,reportId:ticket,error:persisted?'The ticket may already be saved. Retry the same report to confirm its status.':String(error.message||'Could not save report.')});}
}

function reportText_(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new Error(label + ' must be ' + min + '-' + max + ' characters.');
  return value.trim();
}
function reportAttachment_(attachment) {
  if (!attachment) return null;
  if (!attachment || ['image/png', 'image/jpeg'].indexOf(attachment.type) < 0 || typeof attachment.base64 !== 'string' || attachment.base64.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.base64)) throw new Error('Attach a PNG or JPEG screenshot up to 2 MB.');
  var bytes = Utilities.base64Decode(attachment.base64), b = bytes.map(function(n){return n & 255;});
  if (!b.length || b.length > 2 * 1024 * 1024) throw new Error('Screenshot exceeds 2 MB.');
  var png = b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71 && b[4]===13 && b[5]===10 && b[6]===26 && b[7]===10;
  var jpeg = b[0]===255 && b[1]===216 && b[2]===255;
  if (attachment.type === 'image/png' ? !png : !jpeg) throw new Error('Screenshot contents do not match its image type.');
  return Utilities.newBlob(bytes, attachment.type, 'screenshot.' + (png ? 'png' : 'jpg'));
}
