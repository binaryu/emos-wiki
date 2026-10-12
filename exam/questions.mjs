export const questions = [
  {id:1,type:'choice',text:'注册 emos 使用的统一账号系统是哪个？',options:['Telegram','somebyte','Emby','TMDB'],answer:'somebyte'},
  {id:2,type:'choice',text:'没有收到注册验证码，应该先怎么做？',options:['检查垃圾邮件箱','购买观影资格','修改客户端线路','上传电影'],answer:'检查垃圾邮件箱'},
  {id:3,type:'choice',text:'好友邀请你获得观影资格时，你应该提供什么？',options:['邮箱密码','Emby 密码','自己的专属用户 ID','手机验证码'],answer:'自己的专属用户 ID'},
  {id:4,type:'choice',text:'默认获得的三位数随机 Emby 密码有什么特点？',options:['永久有效','就是邮箱密码','所有人相同','具有时效性'],answer:'具有时效性'},
  {id:5,type:'choice',text:'某个客户端无法正常加载或播放时，可以先尝试什么？',options:['注册新账号','更换 Wiki 推荐的其他客户端','上传重复资源','修改用户名'],answer:'更换 Wiki 推荐的其他客户端'},
  {id:6,type:'choice',text:'以下哪种行为可以获得萝卜？',options:['修改头像','反复登录网页','签到','更换客户端'],answer:'签到'},
  {id:7,type:'choice',text:'开始上传资源前，需要满足什么条件？',options:['获得观影资格并同意上传协议','购买片单卡槽','邀请三位好友','达到结丹境界'],answer:'获得观影资格并同意上传协议'},
  {id:8,type:'choice',text:'以下哪种资源符合上传规范？',options:['含字幕广告的视频','与库内版本相同的重复资源','画质严重劣化的低码率新片','无广告、画质合格、不与已有版本重复的普通影视资源'],answer:'无广告、画质合格、不与已有版本重复的普通影视资源'},
  {id:9,type:'choice',text:'关于片单，哪项正确？',options:['不订阅付费片单就不能看剧','不订阅片单也可使用基础片单看剧','片单只能由管理员创建','片单只能收录电影'],answer:'不订阅片单也可使用基础片单看剧'},
  {id:10,type:'choice',text:'查看 emos 服务是否正常，应访问哪个网站？',options:['account.somebyte.org','fund.emos.best','status.emos.best','voice.somebyte.org'],answer:'status.emos.best'},
  {id:11,type:'blank',text:'登录面板后，点击左上角“____”，可以查看专属用户 ID。',answer:'欢迎'},
  {id:12,type:'blank',text:'网页绑定群聊账号时，需要点击面板中的 ____ 绑定链接。',answer:'Telegram',aliases:['tg']},
  {id:13,type:'blank',text:'配置 Emby 客户端，除了地址、端口和账号，还需要填写 ____。',answer:'密码',aliases:['Emby密码']},
  {id:14,type:'blank',text:'拥有 ____ 萝卜、达到筑基境界后，可以解锁固定密码。',answer:'100'},
  {id:15,type:'blank',text:'普通用户转赠萝卜时，系统会收取 ____% 的手续费。',answer:'20',aliases:['20%']},
  {id:16,type:'blank',text:'三个基础片单是“默认”“电影”和“____”。',answer:'电视'},
  {id:17,type:'blank',text:'片单排序数值越 ____，展示位置越靠前。',answer:'小'},
  {id:18,type:'blank',text:'修改头像需进入 somebyte，在“____”中上传并保存头像。',answer:'个人资料'},
  {id:19,type:'boolean',text:'somebyte 用户名以后可以随时修改。',options:['正确','错误'],answer:'错误'},
  {id:20,type:'boolean',text:'视频里的广告即使只出现在字幕或音频中，也不允许上传。',options:['正确','错误'],answer:'正确'},
];

export function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/\s/g,'');
}

export function grade(answers) {
  const incorrect = questions.filter(q => ![q.answer,...(q.aliases || [])].some(a => normalize(a) === normalize(answers[q.id])));
  return {score:(questions.length-incorrect.length)*5,incorrect:incorrect.map(q=>({id:q.id,text:q.text,answer:q.answer}))};
}

export function rewardFor(score) {
  return score >= 90 ? 500 : score >= 70 ? 280 : score >= 60 ? 100 : 0;
}
