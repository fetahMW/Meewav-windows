import {Component,type ReactNode} from "react";
/** Only the tools surface may fail/retry; the live reader and chat stay mounted. */
export default class RoomExperienceBoundary extends Component<{children:ReactNode;version?:number;onChat:()=>void},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidUpdate(previous:Readonly<{version?:number}>){if(previous.version!==this.props.version&&this.state.failed)this.setState({failed:false});}
 render(){if(!this.state.failed)return this.props.children;return <div className="switch-room-waiting" role="alert"><strong>L’expérience n’a pas pu s’afficher.</strong><p>Le lecteur et le chat continuent.</p><button type="button" onClick={()=>this.setState({failed:false})}>Réessayer l’affichage</button><button type="button" onClick={this.props.onChat}>Ouvrir le chat</button></div>;}
}
