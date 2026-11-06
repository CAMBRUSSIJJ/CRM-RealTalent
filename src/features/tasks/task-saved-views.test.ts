import {describe,it,expect} from 'vitest'
import {readSavedTaskViews,writeSavedTaskViews} from './task-saved-views'

describe('visões de Tarefas por workspace',()=>{
  it('preserva filtros válidos e separa cada workspace',()=>{
    const data=new Map<string,string>()
    const store={
      getItem:(key:string)=>data.get(key)??null,
      setItem:(key:string,value:string)=>{data.set(key,value)},
    }
    writeSavedTaskViews('team-a',[{id:'1',name:'Minhas urgentes',owner:'mine',teamId:'all',
      priority:'urgent',query:'',view:'board',layout:'board'}],store)
    expect(readSavedTaskViews('team-a',store)[0].name).toBe('Minhas urgentes')
    expect(readSavedTaskViews('team-b',store)).toEqual([])
  })
  it('descarta registros adulterados sem comprometer o quadro',()=>{
    const s={getItem:()=>JSON.stringify([{id:'1',name:'ok',owner:'all',teamId:'all',
      priority:'normal',query:'',view:'in_progress',layout:'board'},
      {id:'2',name:'xx',view:'unknown',layout:'board'}])}
    expect(readSavedTaskViews('w',s)).toHaveLength(1)
    expect(readSavedTaskViews('w',{getItem:()=>'{invalid json'})).toEqual([])
  })
})
