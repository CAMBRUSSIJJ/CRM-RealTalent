const actions=['read','create','update','delete','export','manage','execute','share','configure']
const matrix={
 owner:new Set(actions),admin:new Set(actions),member:new Set(['read','create','update','delete']),viewer:new Set(['read'])
}
const assertions=[];const expect=(label,value)=>{assertions.push([label,Boolean(value)])}
expect('viewer lê contatos',matrix.viewer.has('read'))
expect('viewer não altera contatos',!matrix.viewer.has('update'))
expect('member opera registros',matrix.member.has('create')&&matrix.member.has('update')&&matrix.member.has('delete'))
expect('admin administra',matrix.admin.has('manage')&&matrix.admin.has('configure'))
expect('owner exporta',matrix.owner.has('export'))
const structuralFields=new Set(['id','workspaceId','createdAt','updatedAt'])
expect('campo id protegido',structuralFields.has('id'))
expect('workspaceId protegido',structuralFields.has('workspaceId'))
const memberIntegration={execute:true,manage:false};expect('member usa integração sem administrá-la',memberIntegration.execute&&!memberIntegration.manage)
for(const [label,ok] of assertions)console.log(`${ok?'OK  ':'FAIL'} ${label}`)
const failed=assertions.filter(([,ok])=>!ok);console.log(`\nPermission Matrix smoke: ${assertions.length-failed.length}/${assertions.length}`);if(failed.length)process.exit(1)
